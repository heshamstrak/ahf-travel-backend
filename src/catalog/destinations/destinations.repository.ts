import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { IdOrSlug, idOrSlugWhere } from "../common/identifiers";
import { pageOffset } from "../common/query";

/** A destination is visible publicly only while published and not soft-deleted. */
export const PUBLIC_DESTINATION: Prisma.DestinationWhereInput = { status: "PUBLISHED", deletedAt: null };

export interface DestinationListFilter {
  featured?: boolean;
  q?: string;
  sort: "sortOrder" | "name";
  page: number;
  pageSize: number;
}

@Injectable()
export class DestinationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private where(filter: Pick<DestinationListFilter, "featured" | "q">): Prisma.DestinationWhereInput {
    return {
      ...PUBLIC_DESTINATION,
      ...(filter.featured !== undefined ? { isFeatured: filter.featured } : {}),
      ...(filter.q ? { name: { contains: filter.q, mode: "insensitive" } } : {}),
    };
  }

  async list(filter: DestinationListFilter) {
    const where = this.where(filter);
    const orderBy: Prisma.DestinationOrderByWithRelationInput[] =
      filter.sort === "name" ? [{ name: "asc" }, { id: "asc" }] : [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }];
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.destination.findMany({
        where,
        orderBy,
        skip: pageOffset(filter.page, filter.pageSize),
        take: filter.pageSize,
      }),
      this.prisma.destination.count({ where }),
    ]);
    return { rows, total };
  }

  findPublic(key: IdOrSlug) {
    return this.prisma.destination.findFirst({ where: { ...idOrSlugWhere(key), ...PUBLIC_DESTINATION } });
  }

  /**
   * Published product counts for many destinations in three grouped queries,
   * regardless of how many destinations are on the page.
   */
  async productCounts(destinationIds: string[]) {
    const empty = new Map<string, number>();
    if (destinationIds.length === 0) {
      return { hotels: empty, tours: empty, packages: empty };
    }
    const [hotels, tours, packageRows] = await Promise.all([
      // Same sellable rule as hotel search: a published room with a published rate plan.
      this.prisma.hotel.groupBy({
        by: ["destinationId"],
        where: {
          destinationId: { in: destinationIds },
          status: "PUBLISHED",
          deletedAt: null,
          rooms: { some: { status: "PUBLISHED", deletedAt: null, ratePlans: { some: { status: "PUBLISHED" } } } },
        },
        _count: { _all: true },
      }),
      this.prisma.tour.groupBy({
        by: ["destinationId"],
        where: { destinationId: { in: destinationIds }, status: "PUBLISHED", deletedAt: null },
        _count: { _all: true },
      }),
      // Grouped in the database: one row per destination, never one row per package.
      this.prisma.$queryRaw<{ destinationId: string; total: number }[]>`
        SELECT j."A" AS "destinationId", count(*)::int AS total
          FROM "_DestinationToPackage" j
          JOIN "Package" p ON p.id = j."B"
         WHERE j."A" = ANY(${destinationIds}::uuid[])
           AND p.status = 'PUBLISHED' AND p."deletedAt" IS NULL
         GROUP BY j."A"`,
    ]);
    const toMap = (rows: { destinationId: string; _count: { _all: number } }[]) =>
      new Map(rows.map((row) => [row.destinationId, row._count._all]));
    return {
      hotels: toMap(hotels),
      tours: toMap(tours),
      packages: new Map(packageRows.map((row) => [row.destinationId, row.total])),
    };
  }
}
