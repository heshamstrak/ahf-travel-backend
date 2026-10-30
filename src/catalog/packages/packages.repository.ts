import { Injectable } from "@nestjs/common";
import { BudgetTier, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { PUBLIC_DESTINATION } from "../destinations/destinations.repository";
import { IdOrSlug, idOrSlugWhere } from "../common/identifiers";
import { notBefore, pageOffset } from "../common/query";
import { PackageSort } from "./packages.dto";

export const PUBLIC_PACKAGE: Prisma.PackageWhereInput = { status: "PUBLISHED", deletedAt: null };

export interface PackageListFilter {
  destination?: string;
  duration: "any" | "short" | "medium" | "long";
  budget: "any" | "budget" | "mid" | "luxury";
  departuresFrom?: Date;
  /** Business today as a UTC-midnight date. Departures before it are never offered. */
  today: Date;
  travellers?: number;
  sort: PackageSort;
  page: number;
  pageSize: number;
}

const ORDER: Record<PackageSort, Prisma.PackageOrderByWithRelationInput[]> = {
  recommended: [{ title: "asc" }, { id: "asc" }],
  "price-asc": [{ basePrice: "asc" }, { id: "asc" }],
  "price-desc": [{ basePrice: "desc" }, { id: "asc" }],
};

/** The API uses the frontend's lowercase tiers; the database stores the enum codes. */
const BUDGET_TIER: Record<"budget" | "mid" | "luxury", BudgetTier> = { budget: "BUDGET", mid: "MID", luxury: "LUXURY" };

function durationWhere(band: string): Prisma.PackageWhereInput | undefined {
  if (band === "short") return { durationNights: { lte: 3 } };
  if (band === "medium") return { durationNights: { gte: 4, lte: 6 } };
  if (band === "long") return { durationNights: { gte: 7 } };
  return undefined;
}

/** Departures shown to the public: open and not yet started. */
const OPEN_DEPARTURE: Prisma.PackageDepartureWhereInput = { status: "OPEN" };

@Injectable()
export class PackagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private listWhere(filter: PackageListFilter): Prisma.PackageWhereInput {
    const duration = durationWhere(filter.duration);
    return {
      ...PUBLIC_PACKAGE,
      ...(filter.destination
        ? { destinations: { some: { ...PUBLIC_DESTINATION, slug: filter.destination } } }
        : {}),
      ...(duration ?? {}),
      ...(filter.budget !== "any" ? { budgetTier: BUDGET_TIER[filter.budget] } : {}),
      ...(filter.travellers !== undefined
        ? { minTravellers: { lte: filter.travellers }, maxTravellers: { gte: filter.travellers } }
        : {}),
      ...(filter.departuresFrom
        ? { departures: { some: { ...OPEN_DEPARTURE, startsOn: { gte: notBefore(filter.departuresFrom, filter.today) } } } }
        : {}),
    };
  }

  async list(filter: PackageListFilter) {
    const where = this.listWhere(filter);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.package.findMany({
        where,
        orderBy: ORDER[filter.sort],
        skip: pageOffset(filter.page, filter.pageSize),
        take: filter.pageSize,
        include: {
          destinations: {
            where: PUBLIC_DESTINATION,
            select: { id: true, slug: true, name: true },
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          },
          departures: {
            where: { ...OPEN_DEPARTURE, startsOn: { gte: notBefore(filter.departuresFrom ?? filter.today, filter.today) } },
            orderBy: [{ startsOn: "asc" }, { id: "asc" }],
            take: 1,
            select: { startsOn: true },
          },
        },
      }),
      this.prisma.package.count({ where }),
    ]);
    return { rows, total };
  }

  findPublic(key: IdOrSlug) {
    return this.prisma.package.findFirst({
      where: { ...idOrSlugWhere(key), ...PUBLIC_PACKAGE },
      include: {
        destinations: {
          where: PUBLIC_DESTINATION,
          select: { id: true, slug: true, name: true },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        },
        cancellationPolicy: { select: { code: true, name: true, description: true, rules: true } },
      },
    });
  }

  findPublicId(key: IdOrSlug) {
    return this.prisma.package.findFirst({ where: { ...idOrSlugWhere(key), ...PUBLIC_PACKAGE }, select: { id: true } });
  }

  departuresIn(packageId: string, from: Date, to: Date) {
    return this.prisma.packageDeparture.findMany({
      where: { packageId, ...OPEN_DEPARTURE, startsOn: { gte: from, lte: to } },
      orderBy: [{ startsOn: "asc" }, { id: "asc" }],
      select: {
        id: true,
        startsOn: true,
        capacity: true,
        heldTravellers: true,
        bookedTravellers: true,
        priceOverride: true,
        overrideCurrency: true,
      },
    });
  }
}
