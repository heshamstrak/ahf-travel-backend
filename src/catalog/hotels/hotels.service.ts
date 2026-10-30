import { Injectable } from "@nestjs/common";
import { businessDate, pastDateMessage } from "../../common/business-date";
import { Clock } from "../../common/clock";
import { Errors, FieldError, validationFailed } from "../../common/errors";
import { IdOrSlug } from "../common/identifiers";
import { MediaReader, PublicImage } from "../common/media";
import { decimalText, moneyAmount } from "../common/money";
import { isValidIsoDate, nightsBetween, Page, toPage, utcDate } from "../common/query";
import { HotelSearchRow, HotelsRepository } from "./hotels.repository";
import { ListHotelsQuery } from "./hotels.dto";

export const MAX_NIGHTS = 30;

export interface HotelSummary {
  id: string;
  slug: string;
  name: string;
  propertyType: string;
  starRating: number;
  addressLine: string;
  destination: { id: string; slug: string; name: string };
  guestRating: { average: string | null; reviewCount: number };
  amenities: string[];
  /** Cheapest published nightly rate. Stay totals arrive with pricing (Milestone 4). */
  fromPricePerNight: { amount: string; currency: string } | null;
  image: PublicImage | null;
  /** Echo of the requested stay. Availability and totals are not applied yet. */
  stay: StayEcho | null;
}

export interface StayEcho {
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number | null;
  rooms: number;
}

export interface HotelDetail {
  id: string;
  slug: string;
  name: string;
  propertyType: string;
  starRating: number;
  addressLine: string;
  latitude: string | null;
  longitude: string | null;
  destination: { id: string; slug: string; name: string };
  guestRating: { average: string | null; reviewCount: number };
  amenities: string[];
  fromPricePerNight: { amount: string; currency: string } | null;
  description: string;
  checkInTime: string;
  checkOutTime: string;
  images: PublicImage[];
}

export interface PublicRatePlan {
  id: string;
  code: string;
  name: string;
  mealPlan: string;
  isRefundable: boolean;
  currency: string;
  basePricePerNight: string;
  extraAdultPerNight: string | null;
  extraChildPerNight: string | null;
  cancellationPolicy: { code: string; name: string; description: string; rules: unknown };
}

export interface PublicRoom {
  id: string;
  code: string;
  name: string;
  bedType: string;
  baseOccupancy: number;
  maxAdults: number;
  maxChildren: number;
  sizeSqm: number | null;
  features: string[];
  images: PublicImage[];
  ratePlans: PublicRatePlan[];
}

@Injectable()
export class HotelsService {
  constructor(
    private readonly repo: HotelsRepository,
    private readonly media: MediaReader,
    private readonly clock: Clock,
  ) {}

  async search(query: ListHotelsQuery): Promise<Page<HotelSummary>> {
    const stay = this.validateStay(query);
    const { rows, total } = await this.repo.search({
      destination: query.destination,
      maxPrice: query.maxPrice,
      stars: query.stars,
      minGuestRating: query.minGuestRating,
      amenities: query.amenities,
      propertyTypes: query.propertyTypes,
      adultsPerRoom: query.guests !== undefined ? Math.ceil(query.guests / (query.rooms ?? 1)) : undefined,
      sort: query.sort ?? "recommended",
      page: query.page,
      pageSize: query.pageSize,
    });

    const covers = await this.media.coversByOwner(
      "HOTEL",
      rows.map((row) => row.id),
    );
    const echo: StayEcho | null = stay
      ? { ...stay, guests: query.guests ?? null, rooms: query.rooms ?? 1 }
      : null;
    const items = rows.map((row) => toSummary(row, covers.get(row.id) ?? null, echo));
    return toPage(items, query, total);
  }

  /** Dates are optional, but when given they must form a valid stay. Availability is not checked yet. */
  private validateStay(query: ListHotelsQuery): { checkIn: string; checkOut: string; nights: number } | null {
    const errors: FieldError[] = [];
    if ((query.checkIn === undefined) !== (query.checkOut === undefined)) {
      errors.push({ field: "checkIn", message: "checkIn and checkOut must be provided together" });
    }
    if (query.checkIn !== undefined && !isValidIsoDate(query.checkIn)) {
      errors.push({ field: "checkIn", message: "must be a real calendar date" });
    }
    if (query.checkOut !== undefined && !isValidIsoDate(query.checkOut)) {
      errors.push({ field: "checkOut", message: "must be a real calendar date" });
    }
    if (errors.length > 0) throw validationFailed(errors);
    if (query.checkIn === undefined || query.checkOut === undefined) return null;

    const checkIn = utcDate(query.checkIn);
    const nights = nightsBetween(checkIn, utcDate(query.checkOut));
    const past = pastDateMessage(query.checkIn, businessDate(this.clock.now()));
    if (past) errors.push({ field: "checkIn", message: past });
    if (nights < 1) errors.push({ field: "checkOut", message: "must be after checkIn" });
    if (nights > MAX_NIGHTS) errors.push({ field: "checkOut", message: `stay cannot exceed ${MAX_NIGHTS} nights` });
    if (errors.length > 0) throw validationFailed(errors);
    return { checkIn: query.checkIn, checkOut: query.checkOut, nights };
  }

  async detail(key: IdOrSlug): Promise<HotelDetail> {
    const hotel = await this.repo.findPublic(key);
    if (!hotel) throw Errors.notFound("Hotel");
    const images = (await this.media.galleriesByOwner("HOTEL", [hotel.id])).get(hotel.id) ?? [];
    const cheapest = cheapestRate(hotel.rooms.flatMap((room) => room.ratePlans));
    return {
      id: hotel.id,
      slug: hotel.slug,
      name: hotel.name,
      propertyType: hotel.propertyType,
      starRating: hotel.starRating,
      addressLine: hotel.addressLine,
      latitude: decimalText(hotel.latitude),
      longitude: decimalText(hotel.longitude),
      destination: hotel.destination,
      guestRating: { average: decimalText(hotel.guestRatingAvg), reviewCount: hotel.reviewCount },
      amenities: hotel.amenities,
      fromPricePerNight: cheapest,
      description: hotel.description,
      checkInTime: hotel.checkInTime,
      checkOutTime: hotel.checkOutTime,
      images,
    };
  }

  async rooms(key: IdOrSlug): Promise<PublicRoom[]> {
    const hotel = await this.repo.findPublicId(key);
    if (!hotel) throw Errors.notFound("Hotel");
    const rooms = await this.repo.publicRooms(hotel.id);
    const images = await this.media.galleriesByOwner(
      "ROOM",
      rooms.map((room) => room.id),
    );
    return rooms.map((room) => ({
      id: room.id,
      code: room.code,
      name: room.name,
      bedType: room.bedType,
      baseOccupancy: room.baseOccupancy,
      maxAdults: room.maxAdults,
      maxChildren: room.maxChildren,
      sizeSqm: room.sizeSqm,
      features: room.features,
      images: images.get(room.id) ?? [],
      ratePlans: room.ratePlans.map((rate) => ({
        id: rate.id,
        code: rate.code,
        name: rate.name,
        mealPlan: rate.mealPlan,
        isRefundable: rate.isRefundable,
        currency: rate.currency,
        basePricePerNight: moneyAmount(rate.basePricePerNight) as string,
        extraAdultPerNight: moneyAmount(rate.extraAdultPerNight),
        extraChildPerNight: moneyAmount(rate.extraChildPerNight),
        cancellationPolicy: rate.cancellationPolicy,
      })),
    }));
  }
}

function toSummary(row: HotelSearchRow, image: PublicImage | null, stay: StayEcho | null): HotelSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    propertyType: row.propertyType,
    starRating: row.starRating,
    addressLine: row.addressLine,
    destination: { id: row.destinationId, slug: row.destinationSlug, name: row.destinationName },
    guestRating: { average: decimalText(row.guestRatingAvg), reviewCount: row.reviewCount },
    amenities: row.amenities,
    fromPricePerNight:
      row.fromPrice !== null && row.fromCurrency !== null
        ? { amount: moneyAmount(row.fromPrice) as string, currency: row.fromCurrency }
        : null,
    image,
    stay,
  };
}

function cheapestRate(
  rates: { basePricePerNight: { toString(): string }; currency: string }[],
): { amount: string; currency: string } | null {
  let best: { amount: string; currency: string; value: number } | null = null;
  for (const rate of rates) {
    const value = Number(rate.basePricePerNight.toString());
    if (best === null || value < best.value) {
      best = { amount: moneyAmount(rate.basePricePerNight.toString()) as string, currency: rate.currency, value };
    }
  }
  return best ? { amount: best.amount, currency: best.currency } : null;
}
