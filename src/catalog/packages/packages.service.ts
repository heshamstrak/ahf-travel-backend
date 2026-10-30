import { Injectable } from "@nestjs/common";
import { businessDay, businessDate, pastDateMessage } from "../../common/business-date";
import { Clock } from "../../common/clock";
import { Errors, FieldError, validationFailed } from "../../common/errors";
import { IdOrSlug } from "../common/identifiers";
import { MediaReader, PublicImage } from "../common/media";
import { moneyAmount } from "../common/money";
import { asText, isValidIsoDate, nightsBetween, Page, toPage, utcDate } from "../common/query";
import { ListPackagesQuery, PackageDeparturesQuery } from "./packages.dto";
import { PackagesRepository } from "./packages.repository";

export const MAX_DEPARTURE_WINDOW_DAYS = 365;

export interface PackageSummary {
  id: string;
  slug: string;
  title: string;
  durationDays: number;
  durationNights: number;
  budgetTier: string;
  pricingBasis: string;
  startingPrice: { amount: string; currency: string };
  destinations: { id: string; slug: string; name: string }[];
  includes: { hotel: boolean; tours: boolean; transfers: boolean };
  nextDeparture: string | null;
  image: PublicImage | null;
}

export interface PackageDetail extends Omit<PackageSummary, "image" | "nextDeparture"> {
  overview: string;
  itinerary: { day: number; title: string; description: string }[];
  components: { hotel: { name: string; stars: number; description: string } | null; tours: string[]; transfers: string[] };
  included: string[];
  excluded: string[];
  pricing: {
    basis: string;
    basePrice: { amount: string; currency: string };
    singleSupplement: string | null;
    childPrice: string | null;
    extraPersonPrice: string | null;
    minTravellers: number;
    maxTravellers: number;
  };
  cancellationPolicy: { code: string; name: string; description: string; rules: unknown };
  images: PublicImage[];
}

export interface DepartureOffer {
  id: string;
  startsOn: string;
  remainingTravellers: number;
  priceOverride: { amount: string; currency: string } | null;
}

@Injectable()
export class PackagesService {
  constructor(
    private readonly repo: PackagesRepository,
    private readonly media: MediaReader,
    private readonly clock: Clock,
  ) {}

  async list(query: ListPackagesQuery): Promise<Page<PackageSummary>> {
    if (query.date !== undefined && !isValidIsoDate(query.date)) {
      throw validationFailed([{ field: "date", message: "must be a real calendar date" }]);
    }
    const today = businessDay(this.clock.now());
    const past = query.date !== undefined ? pastDateMessage(query.date, businessDate(this.clock.now())) : null;
    if (past) throw validationFailed([{ field: "date", message: past }]);
    const { rows, total } = await this.repo.list({
      today,
      destination: query.destination,
      duration: query.duration ?? "any",
      budget: query.budget ?? "any",
      departuresFrom: query.date !== undefined ? utcDate(query.date) : undefined,
      travellers: query.travellers,
      sort: query.sort ?? "recommended",
      page: query.page,
      pageSize: query.pageSize,
    });
    const covers = await this.media.coversByOwner(
      "PACKAGE",
      rows.map((row) => row.id),
    );
    const items = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      durationDays: row.durationDays,
      durationNights: row.durationNights,
      budgetTier: row.budgetTier,
      pricingBasis: row.pricingBasis,
      startingPrice: { amount: moneyAmount(row.basePrice) as string, currency: row.currency },
      destinations: row.destinations,
      includes: includesFlags(row.includes),
      nextDeparture: row.departures[0]?.startsOn.toISOString().slice(0, 10) ?? null,
      image: covers.get(row.id) ?? null,
    }));
    return toPage(items, query, total);
  }

  async detail(key: IdOrSlug): Promise<PackageDetail> {
    const pkg = await this.repo.findPublic(key);
    if (!pkg) throw Errors.notFound("Package");
    const images = (await this.media.galleriesByOwner("PACKAGE", [pkg.id])).get(pkg.id) ?? [];
    return {
      id: pkg.id,
      slug: pkg.slug,
      title: pkg.title,
      durationDays: pkg.durationDays,
      durationNights: pkg.durationNights,
      budgetTier: pkg.budgetTier,
      pricingBasis: pkg.pricingBasis,
      startingPrice: { amount: moneyAmount(pkg.basePrice) as string, currency: pkg.currency },
      destinations: pkg.destinations,
      includes: includesFlags(pkg.includes),
      overview: pkg.overview,
      itinerary: toItinerary(pkg.itinerary),
      components: publicComponents(pkg.includes),
      included: pkg.included,
      excluded: pkg.excluded,
      pricing: {
        basis: pkg.pricingBasis,
        basePrice: { amount: moneyAmount(pkg.basePrice) as string, currency: pkg.currency },
        singleSupplement: moneyAmount(pkg.singleSupplement),
        childPrice: moneyAmount(pkg.childPrice),
        extraPersonPrice: moneyAmount(pkg.extraPersonPrice),
        minTravellers: pkg.minTravellers,
        maxTravellers: pkg.maxTravellers,
      },
      cancellationPolicy: pkg.cancellationPolicy,
      images,
    };
  }

  async departures(key: IdOrSlug, query: PackageDeparturesQuery): Promise<DepartureOffer[]> {
    const from = this.parseDay(query.from, "from");
    const to = this.parseDay(query.to, "to");
    const days = nightsBetween(from, to) + 1;
    const errors: FieldError[] = [];
    if (days < 1) errors.push({ field: "to", message: "must be on or after from" });
    const past = pastDateMessage(query.from, businessDate(this.clock.now()));
    if (past) errors.push({ field: "from", message: past });
    if (days > MAX_DEPARTURE_WINDOW_DAYS) {
      errors.push({ field: "to", message: `window cannot exceed ${MAX_DEPARTURE_WINDOW_DAYS} days` });
    }
    if (errors.length > 0) throw validationFailed(errors);

    const pkg = await this.repo.findPublicId(key);
    if (!pkg) throw Errors.notFound("Package");
    const rows = await this.repo.departuresIn(pkg.id, from, to);
    return rows
      .map((row) => ({
        id: row.id,
        startsOn: row.startsOn.toISOString().slice(0, 10),
        remainingTravellers: Math.max(0, row.capacity - row.bookedTravellers - row.heldTravellers),
        priceOverride: row.priceOverride
          ? { amount: moneyAmount(row.priceOverride) as string, currency: row.overrideCurrency ?? "EGP" }
          : null,
      }))
      .filter((offer) => query.travellers === undefined || offer.remainingTravellers >= query.travellers);
  }

  private parseDay(value: string, field: string): Date {
    if (!isValidIsoDate(value)) {
      throw validationFailed([{ field, message: "must be a real calendar date" }]);
    }
    return utcDate(value);
  }
}

function includesFlags(raw: unknown): { hotel: boolean; tours: boolean; transfers: boolean } {
  const obj = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return { hotel: obj.hotel !== undefined, tours: Array.isArray(obj.tours) && obj.tours.length > 0, transfers: Array.isArray(obj.transfers) && obj.transfers.length > 0 };
}

function publicComponents(raw: unknown): PackageDetail["components"] {
  const obj = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const hotel = (typeof obj.hotel === "object" && obj.hotel !== null ? obj.hotel : null) as Record<string, unknown> | null;
  return {
    hotel: hotel ? { name: asText(hotel.name), stars: Number(hotel.stars ?? 0), description: asText(hotel.description) } : null,
    tours: Array.isArray(obj.tours) ? obj.tours.map(String) : [],
    transfers: Array.isArray(obj.transfers) ? obj.transfers.map(String) : [],
  };
}

function toItinerary(raw: unknown): PackageDetail["itinerary"] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((day): day is Record<string, unknown> => typeof day === "object" && day !== null)
    .map((day) => ({ day: Number(day.day ?? 0), title: asText(day.title), description: asText(day.description) }));
}
