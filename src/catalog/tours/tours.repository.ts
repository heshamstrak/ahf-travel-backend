import { Injectable } from "@nestjs/common";
import { Prisma, TourCategory } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { PUBLIC_DESTINATION } from "../destinations/destinations.repository";
import { IdOrSlug, idOrSlugWhere } from "../common/identifiers";
import { notBefore, pageOffset } from "../common/query";
import { TourSort } from "./tours.dto";

export const PUBLIC_TOUR: Prisma.TourWhereInput = {
  status: "PUBLISHED",
  deletedAt: null,
  destination: PUBLIC_DESTINATION,
};

/** Only sessions that are open for sale appear publicly. Past departures are removed by the calendar filter. */
const OPEN_SESSION: Prisma.TourSessionWhereInput = { status: "OPEN" };

export interface TourListFilter {
  destination?: string;
  dayStart?: Date;
  dayEnd?: Date;
  guests?: number;
  categories?: string[];
  maxPrice?: number;
  durations?: string[];
  minRating?: number;
  sort: TourSort;
  page: number;
  pageSize: number;
}

const ORDER: Record<TourSort, Prisma.TourOrderByWithRelationInput[]> = {
  recommended: [{ guestRatingAvg: "desc" }, { reviewCount: "desc" }, { id: "asc" }],
  "price-asc": [{ pricePerPerson: "asc" }, { id: "asc" }],
  "price-desc": [{ pricePerPerson: "desc" }, { id: "asc" }],
  rating: [{ guestRatingAvg: "desc" }, { title: "asc" }, { id: "asc" }],
};

/** Duration bands match the frontend: short <= 180 min, half 181-360, full > 360. */
function durationWhere(bands: string[]): Prisma.TourWhereInput[] {
  return bands.map((band) => {
    if (band === "short") return { durationMinutes: { lte: 180 } };
    if (band === "half") return { durationMinutes: { gt: 180, lte: 360 } };
    return { durationMinutes: { gt: 360 } };
  });
}

@Injectable()
export class ToursRepository {
  constructor(private readonly prisma: PrismaService) {}

  private listWhere(filter: TourListFilter): Prisma.TourWhereInput {
    return {
      ...PUBLIC_TOUR,
      ...(filter.destination ? { destination: { ...PUBLIC_DESTINATION, slug: filter.destination } } : {}),
      ...(filter.guests !== undefined ? { maxGroupSize: { gte: filter.guests } } : {}),
      ...(filter.categories?.length ? { category: { in: filter.categories as TourCategory[] } } : {}),
      ...(filter.maxPrice !== undefined ? { pricePerPerson: { lte: filter.maxPrice } } : {}),
      ...(filter.minRating !== undefined ? { guestRatingAvg: { gte: filter.minRating } } : {}),
      ...(filter.durations?.length ? { OR: durationWhere(filter.durations) } : {}),
      ...(filter.dayStart && filter.dayEnd
        ? {
            sessions: {
              some: { ...OPEN_SESSION, startsAt: { gte: notBefore(filter.dayStart), lt: filter.dayEnd } },
            },
          }
        : {}),
    };
  }

  async list(filter: TourListFilter) {
    const where = this.listWhere(filter);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.tour.findMany({
        where,
        orderBy: ORDER[filter.sort],
        skip: pageOffset(filter.page, filter.pageSize),
        take: filter.pageSize,
        select: {
          id: true,
          slug: true,
          title: true,
          category: true,
          durationMinutes: true,
          maxGroupSize: true,
          languages: true,
          currency: true,
          pricePerPerson: true,
          guestRatingAvg: true,
          reviewCount: true,
          meetingPoint: true,
          destination: { select: { id: true, slug: true, name: true } },
        },
      }),
      this.prisma.tour.count({ where }),
    ]);
    return { rows, total };
  }

  findPublic(key: IdOrSlug) {
    return this.prisma.tour.findFirst({
      where: { ...idOrSlugWhere(key), ...PUBLIC_TOUR },
      include: {
        destination: { select: { id: true, slug: true, name: true } },
        cancellationPolicy: { select: { code: true, name: true, description: true, rules: true } },
      },
    });
  }

  findPublicId(key: IdOrSlug) {
    return this.prisma.tour.findFirst({ where: { ...idOrSlugWhere(key), ...PUBLIC_TOUR }, select: { id: true } });
  }

  /**
   * Open departures in a window that have not started yet. Held and booked counters are read only to
   * derive remaining seats.
   */
  sessionsIn(tourId: string, from: Date, to: Date) {
    return this.prisma.tourSession.findMany({
      where: { tourId, ...OPEN_SESSION, startsAt: { gte: notBefore(from), lt: to } },
      select: {
        id: true,
        startsAt: true,
        capacity: true,
        heldUnits: true,
        bookedUnits: true,
        priceOverride: true,
        overrideCurrency: true,
      },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    });
  }
}
