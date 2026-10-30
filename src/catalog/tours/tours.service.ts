import { Injectable } from "@nestjs/common";
import { businessDate, pastDateMessage } from "../../common/business-date";
import { Clock } from "../../common/clock";
import { Errors, FieldError, validationFailed } from "../../common/errors";
import { IdOrSlug } from "../common/identifiers";
import { MediaReader, PublicImage } from "../common/media";
import { decimalText, moneyAmount } from "../common/money";
import { asText, isValidIsoDate, nightsBetween, Page, toPage, utcDate } from "../common/query";
import { ListToursQuery, TourSessionsQuery } from "./tours.dto";
import { ToursRepository } from "./tours.repository";

export const MAX_SESSION_WINDOW_DAYS = 90;
const DAY_MS = 86_400_000;

export interface TourSummary {
  id: string;
  slug: string;
  title: string;
  category: string;
  durationMinutes: number;
  maxGroupSize: number;
  languages: string[];
  meetingPoint: string;
  rating: { average: string | null; reviewCount: number };
  destination: { id: string; slug: string; name: string };
  fromPricePerPerson: { amount: string; currency: string };
  image: PublicImage | null;
}

export interface TourDetail extends Omit<TourSummary, "image" | "fromPricePerPerson"> {
  overview: string;
  highlights: string[];
  included: string[];
  excluded: string[];
  importantInfo: string[];
  itinerary: { time: string; offsetMinutes: number; title: string; description: string }[];
  cancellationPolicy: { code: string; name: string; description: string; rules: unknown };
  fromPricePerPerson: { amount: string; currency: string };
  images: PublicImage[];
}

export interface TourSessionOffer {
  id: string;
  startsAt: string;
  remainingUnits: number;
  /** Null when the departure uses the tour's base price. */
  pricePerPerson: { amount: string; currency: string } | null;
}

@Injectable()
export class ToursService {
  constructor(
    private readonly repo: ToursRepository,
    private readonly media: MediaReader,
    private readonly clock: Clock,
  ) {}

  async list(query: ListToursQuery): Promise<Page<TourSummary>> {
    const day = query.date !== undefined ? this.dayWindow(query.date) : null;
    const { rows, total } = await this.repo.list({
      destination: query.destination,
      dayStart: day?.start,
      dayEnd: day?.end,
      guests: query.guests,
      categories: query.categories,
      maxPrice: query.maxPrice,
      durations: query.durations,
      minRating: query.minRating,
      sort: query.sort ?? "recommended",
      page: query.page,
      pageSize: query.pageSize,
    });
    const covers = await this.media.coversByOwner(
      "TOUR",
      rows.map((row) => row.id),
    );
    const items = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      category: row.category,
      durationMinutes: row.durationMinutes,
      maxGroupSize: row.maxGroupSize,
      languages: row.languages,
      meetingPoint: row.meetingPoint,
      rating: { average: decimalText(row.guestRatingAvg), reviewCount: row.reviewCount },
      destination: row.destination,
      fromPricePerPerson: { amount: moneyAmount(row.pricePerPerson) as string, currency: row.currency },
      image: covers.get(row.id) ?? null,
    }));
    return toPage(items, query, total);
  }

  private dayWindow(date: string): { start: Date; end: Date } {
    if (!isValidIsoDate(date)) {
      throw validationFailed([{ field: "date", message: "must be a real calendar date" }]);
    }
    this.assertNotPast("date", date);
    const start = utcDate(date);
    return { start, end: new Date(start.getTime() + DAY_MS) };
  }

  async detail(key: IdOrSlug): Promise<TourDetail> {
    const tour = await this.repo.findPublic(key);
    if (!tour) throw Errors.notFound("Tour");
    const images = (await this.media.galleriesByOwner("TOUR", [tour.id])).get(tour.id) ?? [];
    return {
      id: tour.id,
      slug: tour.slug,
      title: tour.title,
      category: tour.category,
      durationMinutes: tour.durationMinutes,
      maxGroupSize: tour.maxGroupSize,
      languages: tour.languages,
      meetingPoint: tour.meetingPoint,
      rating: { average: decimalText(tour.guestRatingAvg), reviewCount: tour.reviewCount },
      destination: tour.destination,
      fromPricePerPerson: { amount: moneyAmount(tour.pricePerPerson) as string, currency: tour.currency },
      overview: tour.overview,
      highlights: tour.highlights,
      included: tour.included,
      excluded: tour.excluded,
      importantInfo: tour.importantInfo,
      // Only public fields of each step. The stored JSON may hold more.
      itinerary: toItinerary(tour.itinerary),
      cancellationPolicy: tour.cancellationPolicy,
      images,
    };
  }

  async sessions(key: IdOrSlug, query: TourSessionsQuery): Promise<TourSessionOffer[]> {
    const from = this.parseDay(query.from, "from");
    const to = this.parseDay(query.to, "to");
    const days = nightsBetween(from, to) + 1;
    const errors: FieldError[] = [];
    const past = pastDateMessage(query.from, businessDate(this.clock.now()));
    if (past) errors.push({ field: "from", message: past });
    if (days < 1) errors.push({ field: "to", message: "must be on or after from" });
    if (days > MAX_SESSION_WINDOW_DAYS) errors.push({ field: "to", message: `window cannot exceed ${MAX_SESSION_WINDOW_DAYS} days` });
    if (errors.length > 0) throw validationFailed(errors);

    const tour = await this.repo.findPublicId(key);
    if (!tour) throw Errors.notFound("Tour");
    const rows = await this.repo.sessionsIn(tour.id, from, new Date(to.getTime() + DAY_MS));
    return rows
      .map((session) => ({
        id: session.id,
        startsAt: session.startsAt.toISOString(),
        remainingUnits: Math.max(0, session.capacity - session.bookedUnits - session.heldUnits),
        pricePerPerson: session.priceOverride
          ? { amount: moneyAmount(session.priceOverride) as string, currency: session.overrideCurrency ?? "EGP" }
          : null,
      }))
      .filter((offer) => query.participants === undefined || offer.remainingUnits >= query.participants);
  }

  private parseDay(value: string, field: string): Date {
    if (!isValidIsoDate(value)) {
      throw validationFailed([{ field, message: "must be a real calendar date" }]);
    }
    return utcDate(value);
  }

  private assertNotPast(field: string, value: string): void {
    const past = pastDateMessage(value, businessDate(this.clock.now()));
    if (past) throw validationFailed([{ field, message: past }]);
  }
}

function toItinerary(raw: unknown): TourDetail["itinerary"] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((step): step is Record<string, unknown> => typeof step === "object" && step !== null)
    .map((step) => ({
      time: asText(step.time),
      offsetMinutes: Number(step.offsetMinutes ?? 0),
      title: asText(step.title),
      description: asText(step.description),
    }));
}
