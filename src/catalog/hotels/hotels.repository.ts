import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { PUBLIC_DESTINATION } from "../destinations/destinations.repository";
import { IdOrSlug, idOrSlugWhere } from "../common/identifiers";
import { pageOffset } from "../common/query";
import { HotelSort } from "./hotels.dto";

export const PUBLIC_HOTEL: Prisma.HotelWhereInput = {
  status: "PUBLISHED",
  deletedAt: null,
  destination: PUBLIC_DESTINATION,
};
export const PUBLIC_ROOM: Prisma.RoomWhereInput = { status: "PUBLISHED", deletedAt: null };
export const PUBLIC_RATE_PLAN: Prisma.RatePlanWhereInput = { status: "PUBLISHED" };

export interface HotelSearchFilter {
  destination?: string;
  maxPrice?: number;
  stars?: number[];
  minGuestRating?: number;
  amenities?: string[];
  propertyTypes?: string[];
  /** Adults that one room must accommodate: ceil(guests / rooms). */
  adultsPerRoom?: number;
  sort: HotelSort;
  page: number;
  pageSize: number;
}

export interface HotelSearchRow {
  id: string;
  slug: string;
  name: string;
  propertyType: string;
  starRating: number;
  addressLine: string;
  guestRatingAvg: Prisma.Decimal;
  reviewCount: number;
  amenities: string[];
  destinationId: string;
  destinationSlug: string;
  destinationName: string;
  fromPrice: Prisma.Decimal | null;
  fromCurrency: string | null;
}

/** Cheapest published rate plan of published rooms, per hotel. One LATERAL subquery, index-backed. */
const FROM_PRICE = Prisma.sql`
  LEFT JOIN LATERAL (
    SELECT rp."basePricePerNight" AS price, rp.currency AS currency
      FROM "Room" r
      JOIN "RatePlan" rp ON rp."roomId" = r.id
     WHERE r."hotelId" = h.id
       AND r.status = 'PUBLISHED' AND r."deletedAt" IS NULL
       AND rp.status = 'PUBLISHED'
     ORDER BY rp."basePricePerNight" ASC, rp.id ASC
     LIMIT 1
  ) fp ON true`;

/** Fixed ORDER BY fragments. Sort keys come from an allowlist, never from user text. */
const ORDER_BY: Record<HotelSort, Prisma.Sql> = {
  recommended: Prisma.sql`h."guestRatingAvg" DESC, h."reviewCount" DESC, h.id ASC`,
  "price-asc": Prisma.sql`fp.price ASC NULLS LAST, h.id ASC`,
  "price-desc": Prisma.sql`fp.price DESC NULLS LAST, h.id ASC`,
  rating: Prisma.sql`h."guestRatingAvg" DESC, h.name ASC, h.id ASC`,
  stars: Prisma.sql`h."starRating" DESC, h."guestRatingAvg" DESC, h.id ASC`,
};

@Injectable()
export class HotelsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private searchWhere(filter: HotelSearchFilter): Prisma.Sql {
    // Listing visibility is governed by publish status alone — a hotel with no priced room yet
    // (e.g. just created, rooms/rate plans still being set up) still appears, with a null
    // fromPrice the frontend renders as "Price on request", the same way the detail page already
    // resolves it. It only drops out of a maxPrice-filtered search (NULL <= x is never true in
    // SQL), which is correct: we can't say an unpriced hotel is "under" a price cap.
    const conditions: Prisma.Sql[] = [
      Prisma.sql`h.status = 'PUBLISHED'`,
      Prisma.sql`h."deletedAt" IS NULL`,
      Prisma.sql`d.status = 'PUBLISHED'`,
      Prisma.sql`d."deletedAt" IS NULL`,
    ];
    if (filter.destination) conditions.push(Prisma.sql`d.slug = ${filter.destination}`);
    if (filter.stars?.length) conditions.push(Prisma.sql`h."starRating" IN (${Prisma.join(filter.stars)})`);
    if (filter.minGuestRating !== undefined) conditions.push(Prisma.sql`h."guestRatingAvg" >= ${filter.minGuestRating}`);
    if (filter.propertyTypes?.length) {
      conditions.push(Prisma.sql`h."propertyType"::text IN (${Prisma.join(filter.propertyTypes)})`);
    }
    // Every requested amenity must be present (AND semantics, matching the frontend).
    if (filter.amenities?.length) conditions.push(Prisma.sql`h.amenities @> ${filter.amenities}::text[]`);
    if (filter.maxPrice !== undefined) conditions.push(Prisma.sql`fp.price <= ${filter.maxPrice}`);
    if (filter.adultsPerRoom !== undefined) {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "Room" r2
         WHERE r2."hotelId" = h.id AND r2.status = 'PUBLISHED' AND r2."deletedAt" IS NULL
           AND r2."maxAdults" >= ${filter.adultsPerRoom})`);
    }
    return Prisma.join(conditions, " AND ");
  }

  async search(filter: HotelSearchFilter): Promise<{ rows: HotelSearchRow[]; total: number }> {
    const where = this.searchWhere(filter);
    const from = Prisma.sql`FROM "Hotel" h JOIN "Destination" d ON d.id = h."destinationId" ${FROM_PRICE}`;
    const items = this.prisma.$queryRaw<HotelSearchRow[]>`
      SELECT h.id, h.slug, h.name, h."propertyType"::text AS "propertyType", h."starRating",
             h."addressLine", h."guestRatingAvg", h."reviewCount", h.amenities,
             d.id AS "destinationId", d.slug AS "destinationSlug", d.name AS "destinationName",
             fp.price AS "fromPrice", fp.currency AS "fromCurrency"
        ${from}
       WHERE ${where}
       ORDER BY ${ORDER_BY[filter.sort]}
       LIMIT ${filter.pageSize} OFFSET ${pageOffset(filter.page, filter.pageSize)}`;
    const count = this.prisma.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total
        ${from}
       WHERE ${where}`;
    const [rows, totalRows] = await this.prisma.$transaction([items, count]);
    return { rows, total: totalRows[0]?.total ?? 0 };
  }

  findPublic(key: IdOrSlug) {
    return this.prisma.hotel.findFirst({
      where: { ...idOrSlugWhere(key), ...PUBLIC_HOTEL },
      include: {
        destination: { select: { id: true, slug: true, name: true } },
        rooms: {
          where: PUBLIC_ROOM,
          select: { ratePlans: { where: PUBLIC_RATE_PLAN, select: { basePricePerNight: true, currency: true } } },
        },
      },
    });
  }

  findPublicId(key: IdOrSlug) {
    return this.prisma.hotel.findFirst({ where: { ...idOrSlugWhere(key), ...PUBLIC_HOTEL }, select: { id: true } });
  }

  /** Published rooms with at least one published rate plan. Unsellable rooms are not listed. */
  publicRooms(hotelId: string) {
    return this.prisma.room.findMany({
      where: { hotelId, ...PUBLIC_ROOM, ratePlans: { some: PUBLIC_RATE_PLAN } },
      include: {
        ratePlans: {
          where: PUBLIC_RATE_PLAN,
          orderBy: [{ isRefundable: "desc" }, { basePricePerNight: "asc" }, { id: "asc" }],
          include: { cancellationPolicy: { select: { code: true, name: true, description: true, rules: true } } },
        },
      },
      orderBy: [{ code: "asc" }, { id: "asc" }],
    });
  }
}
