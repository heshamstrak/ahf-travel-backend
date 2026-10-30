import { Injectable } from "@nestjs/common";
import { businessDate, pastDateMessage } from "../../common/business-date";
import { Clock } from "../../common/clock";
import { Errors, FieldError, validationFailed } from "../../common/errors";
import { IdOrSlug } from "../common/identifiers";
import { MediaReader, PublicImage } from "../common/media";
import { moneyAmount } from "../common/money";
import { isValidIsoDate, nightsBetween, Page, toPage, utcDate } from "../common/query";
import { CarsRepository } from "./cars.repository";
import { ListCarsQuery } from "./cars.dto";

export const MAX_RENTAL_DAYS = 60;

export interface CarSummary {
  id: string;
  slug: string;
  brand: string;
  name: string;
  category: string;
  transmission: string;
  hasAirConditioning: boolean;
  passengers: number;
  bags: number;
  doors: number;
  minDriverAge: number;
  pricePerDay: { amount: string; currency: string };
  image: PublicImage | null;
  rental: RentalEcho | null;
}

export interface RentalEcho {
  pickupDate: string;
  dropoffDate: string;
  days: number;
}

export interface CarDetail extends Omit<CarSummary, "image" | "rental"> {
  includedKmPerDay: number;
  fuelPolicy: string;
  deposit: { amount: string; currency: string };
  coverage: string[];
  rentalConditions: string[];
  pickupNotes: string | null;
  cancellationPolicy: { code: string; name: string; description: string; rules: unknown };
  images: PublicImage[];
}

@Injectable()
export class CarsService {
  constructor(
    private readonly repo: CarsRepository,
    private readonly media: MediaReader,
    private readonly clock: Clock,
  ) {}

  async list(query: ListCarsQuery): Promise<Page<CarSummary>> {
    const rental = this.validateRental(query.pickupDate, query.dropoffDate);
    const { rows, total } = await this.repo.list({
      driverAge: query.driverAge,
      categories: query.categories,
      transmission: query.transmission,
      minPassengers: query.minPassengers,
      minBags: query.minBags,
      airConditioning: query.airConditioning,
      brands: query.brands,
      maxPrice: query.maxPrice,
      sort: query.sort ?? "recommended",
      page: query.page,
      pageSize: query.pageSize,
    });
    const covers = await this.media.coversByOwner(
      "CAR_MODEL",
      rows.map((row) => row.id),
    );
    const items = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      brand: row.brand,
      name: row.name,
      category: row.category,
      transmission: row.transmission,
      hasAirConditioning: row.hasAirConditioning,
      passengers: row.passengers,
      bags: row.bags,
      doors: row.doors,
      minDriverAge: row.minDriverAge,
      pricePerDay: { amount: moneyAmount(row.pricePerDay) as string, currency: row.currency },
      image: covers.get(row.id) ?? null,
      rental,
    }));
    return toPage(items, query, total);
  }

  /** Both dates or neither. A rental is at least one day and at most MAX_RENTAL_DAYS. */
  private validateRental(pickupDate?: string, dropoffDate?: string): RentalEcho | null {
    if ((pickupDate === undefined) !== (dropoffDate === undefined)) {
      throw validationFailed([{ field: "pickupDate", message: "pickupDate and dropoffDate must be provided together" }]);
    }
    if (pickupDate === undefined || dropoffDate === undefined) return null;
    const errors: FieldError[] = [];
    if (!isValidIsoDate(pickupDate)) errors.push({ field: "pickupDate", message: "must be a real calendar date" });
    const past = pastDateMessage(pickupDate, businessDate(this.clock.now()));
    if (past) errors.push({ field: "pickupDate", message: past });
    if (!isValidIsoDate(dropoffDate)) errors.push({ field: "dropoffDate", message: "must be a real calendar date" });
    if (errors.length > 0) throw validationFailed(errors);
    const days = nightsBetween(utcDate(pickupDate), utcDate(dropoffDate));
    if (days < 1) errors.push({ field: "dropoffDate", message: "must be after pickupDate" });
    if (days > MAX_RENTAL_DAYS) errors.push({ field: "dropoffDate", message: `rental cannot exceed ${MAX_RENTAL_DAYS} days` });
    if (errors.length > 0) throw validationFailed(errors);
    return { pickupDate, dropoffDate, days };
  }

  async detail(key: IdOrSlug): Promise<CarDetail> {
    const car = await this.repo.findPublic(key);
    if (!car) throw Errors.notFound("Car");
    const images = (await this.media.galleriesByOwner("CAR_MODEL", [car.id])).get(car.id) ?? [];
    return {
      id: car.id,
      slug: car.slug,
      brand: car.brand,
      name: car.name,
      category: car.category,
      transmission: car.transmission,
      hasAirConditioning: car.hasAirConditioning,
      passengers: car.passengers,
      bags: car.bags,
      doors: car.doors,
      minDriverAge: car.minDriverAge,
      pricePerDay: { amount: moneyAmount(car.pricePerDay) as string, currency: car.currency },
      includedKmPerDay: car.includedKmPerDay,
      fuelPolicy: car.fuelPolicy,
      deposit: { amount: moneyAmount(car.depositAmount) as string, currency: car.currency },
      coverage: car.coverage,
      rentalConditions: car.rentalConditions,
      pickupNotes: car.pickupNotes,
      cancellationPolicy: car.cancellationPolicy,
      images,
    };
  }
}
