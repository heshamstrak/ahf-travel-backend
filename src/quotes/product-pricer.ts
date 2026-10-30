import { Injectable } from "@nestjs/common";
import { addDays, dayDifference } from "../common/business-date";
import { PricingConfigError, PricingRejection } from "../pricing/errors";
import {
  assertDriverAge,
  assertTransferParty,
  BaseLine,
  carLines,
  hotelLines,
  MAX_STAY_NIGHTS,
  packageLines,
  rentalDays,
  tourLines,
  transferLines,
} from "../pricing/calculators";
import { Money, parseMoney } from "../pricing/money";
import type { RuleContext } from "../pricing/rules";
import { QuotesRepository } from "./quotes.repository";
import type { Selection } from "./quote-selection";

/** A product priced for one selection: the base lines and the facts rules are checked against. */
export interface PricedProduct {
  productType: "HOTEL" | "TOUR" | "CAR" | "TRANSFER" | "PACKAGE";
  productId: string;
  currency: string;
  lines: BaseLine[];
  /** Notes attached to base lines, keyed by code (for example a development placeholder price). */
  notes: Record<string, string>;
  facts: Pick<RuleContext, "nights" | "days" | "travellers" | "driverAge">;
  selection: Record<string, unknown>;
  product: Record<string, unknown>;
}

const utcDay = (date: string): Date => new Date(`${date}T00:00:00Z`);
const isoOf = (value: Date): string => value.toISOString().slice(0, 10);

function notFound(what: string): PricingRejection {
  return new PricingRejection(404, "NOT_FOUND", `${what} was not found`);
}

function inThePast(field: string): PricingRejection {
  return new PricingRejection(422, "VALIDATION_FAILED", "must not be in the past", field);
}

/** A free-units count from the availability counters. Units are never reserved here. */
function freeUnits(total: number, ...taken: number[]): number {
  return total - taken.reduce((sum, value) => sum + value, 0);
}

@Injectable()
export class ProductPricer {
  constructor(private readonly repo: QuotesRepository) {}

  async hotel(ratePlanId: string, sel: Selection<"HOTEL">, today: string): Promise<PricedProduct> {
    const plan = await this.repo.findSellableRatePlan(ratePlanId);
    if (!plan) throw notFound("Rate");
    if (sel.checkIn < today) throw inThePast("checkIn");
    const nights = dayDifference(sel.checkIn, sel.checkOut);
    if (nights < 1) throw new PricingRejection(422, "VALIDATION_FAILED", "checkOut must be after checkIn", "checkOut");
    if (nights > MAX_STAY_NIGHTS) {
      throw new PricingRejection(422, "VALIDATION_FAILED", `a stay cannot exceed ${MAX_STAY_NIGHTS} nights`, "checkOut");
    }

    const currency = plan.currency;
    const nightDates = Array.from({ length: nights }, (_, index) => addDays(sel.checkIn, index));
    const from = utcDay(sel.checkIn);
    const to = utcDay(sel.checkOut);

    const nightlyOverrides = new Map<string, Money>();
    for (const row of await this.repo.roomRateOverrides(plan.id, from, to)) {
      if (row.currency !== currency) throw new PricingConfigError(`room rate currency ${row.currency} differs from rate plan ${currency}`);
      nightlyOverrides.set(isoOf(row.date), parseMoney(row.pricePerNight.toString(), currency));
    }

    // Every night must have sellable rooms. A missing counter row means the night is not sold.
    const inventory = new Map((await this.repo.roomInventory(plan.roomId, from, to)).map((row) => [isoOf(row.date), row]));
    for (const date of nightDates) {
      const row = inventory.get(date);
      if (!row || freeUnits(row.totalUnits, row.soldUnits, row.heldUnits, row.blockedUnits) < sel.rooms) {
        throw new PricingRejection(409, "NOT_AVAILABLE", `not enough rooms are available on ${date}`);
      }
    }

    const lines = hotelLines({
      nightDates,
      nightlyOverrides,
      rooms: sel.rooms,
      adults: sel.adults,
      children: sel.children,
      rate: {
        basePerNight: parseMoney(plan.basePricePerNight.toString(), currency),
        baseOccupancy: plan.room.baseOccupancy,
        maxAdults: plan.room.maxAdults,
        maxChildren: plan.room.maxChildren,
        extraAdultPerNight: plan.extraAdultPerNight ? parseMoney(plan.extraAdultPerNight.toString(), currency) : null,
        extraChildPerNight: plan.extraChildPerNight ? parseMoney(plan.extraChildPerNight.toString(), currency) : null,
      },
    });

    return {
      productType: "HOTEL",
      productId: plan.id,
      currency,
      lines,
      notes: {},
      facts: { nights, travellers: sel.adults + sel.children },
      selection: { checkIn: sel.checkIn, checkOut: sel.checkOut, nights, rooms: sel.rooms, adults: sel.adults, children: sel.children },
      product: {
        hotel: plan.room.hotel,
        room: { id: plan.room.id, code: plan.room.code, name: plan.room.name, bedType: plan.room.bedType },
        ratePlan: { id: plan.id, code: plan.code, name: plan.name, mealPlan: plan.mealPlan, isRefundable: plan.isRefundable },
        cancellationPolicy: plan.cancellationPolicy,
      },
    };
  }

  async tour(sessionId: string, sel: Selection<"TOUR">, now: Date): Promise<PricedProduct> {
    const session = await this.repo.findTourSession(sessionId);
    // A session that has started is not offered, the same rule the public sessions list applies.
    if (!session || session.startsAt <= now) throw notFound("Tour session");

    const tour = session.tour;
    const currency = session.overrideCurrency ?? tour.currency;
    const unit = parseMoney((session.priceOverride ?? tour.pricePerPerson).toString(), currency);
    const lines = tourLines({ unit, participants: sel.participants, maxGroupSize: tour.maxGroupSize });
    if (freeUnits(session.capacity, session.bookedUnits, session.heldUnits) < sel.participants) {
      throw new PricingRejection(409, "NOT_AVAILABLE", "not enough places are left on this departure");
    }

    return {
      productType: "TOUR",
      productId: session.id,
      currency,
      lines,
      notes: {},
      facts: { travellers: sel.participants },
      selection: { participants: sel.participants },
      product: {
        tour: { id: tour.id, slug: tour.slug, title: tour.title },
        session: { id: session.id, startsAt: session.startsAt.toISOString() },
        cancellationPolicy: tour.cancellationPolicy,
      },
    };
  }

  async car(carModelId: string, sel: Selection<"CAR">, today: string): Promise<PricedProduct> {
    const car = await this.repo.findSellableCarModel(carModelId);
    if (!car) throw notFound("Car");
    const location = await this.repo.findPickupLocation(sel.pickupLocationId);
    if (!location) throw notFound("Pick-up location");
    if (sel.pickupDate < today) throw inThePast("pickupDate");

    const days = rentalDays(sel.pickupDate, sel.dropoffDate);
    assertDriverAge(sel.driverAge, car.minDriverAge);

    // Every day of the rental needs a free vehicle at the pick-up branch.
    const from = utcDay(sel.pickupDate);
    const to = utcDay(sel.dropoffDate);
    const inventory = new Map((await this.repo.carInventory(car.id, location.id, from, to)).map((row) => [isoOf(row.date), row]));
    for (let index = 0; index < days; index++) {
      const date = addDays(sel.pickupDate, index);
      const row = inventory.get(date);
      if (!row || freeUnits(row.totalUnits, row.bookedUnits, row.heldUnits, row.blockedUnits) < 1) {
        throw new PricingRejection(409, "NOT_AVAILABLE", `no ${car.name} is available on ${date}`);
      }
    }

    return {
      productType: "CAR",
      productId: car.id,
      currency: car.currency,
      lines: carLines(parseMoney(car.pricePerDay.toString(), car.currency), days),
      notes: {},
      facts: { days, driverAge: sel.driverAge },
      selection: { pickupDate: sel.pickupDate, dropoffDate: sel.dropoffDate, pickupLocationId: location.id, driverAge: sel.driverAge, days },
      product: {
        car: { id: car.id, slug: car.slug, brand: car.brand, name: car.name, minDriverAge: car.minDriverAge },
        pickupLocation: { id: location.id, name: location.name, code: location.code, type: location.type },
        cancellationPolicy: car.cancellationPolicy,
      },
    };
  }

  async transfer(transferRateId: string, sel: Selection<"TRANSFER">, today: string): Promise<PricedProduct> {
    if (sel.date < today) throw inThePast("date");
    const date = utcDay(sel.date);
    const rate = await this.repo.findTransferRate(transferRateId, date);
    if (!rate) throw notFound("Transfer rate");

    const vehicle = rate.vehicleClass;
    assertTransferParty(sel.passengers, sel.luggage, vehicle.passengersMax, vehicle.luggageMax);
    const capacity = await this.repo.transferCapacity(vehicle.id, date);
    if (!capacity || freeUnits(capacity.totalUnits, capacity.bookedUnits, capacity.heldUnits) < 1) {
      throw new PricingRejection(409, "NOT_AVAILABLE", `no ${vehicle.name} is free on ${sel.date}`);
    }

    const lines = transferLines(parseMoney(rate.amount.toString(), rate.currency));
    return {
      productType: "TRANSFER",
      productId: rate.id,
      currency: rate.currency,
      lines,
      notes: rate.isDevPlaceholder ? { VEHICLE: "DEV_PLACEHOLDER_PRICE" } : {},
      facts: { travellers: sel.passengers },
      selection: { date: sel.date, passengers: sel.passengers, luggage: sel.luggage },
      product: {
        origin: rate.origin,
        destination: rate.destination,
        vehicleClass: { id: vehicle.id, code: vehicle.code, name: vehicle.name },
        durationMinutes: rate.durationMinutes,
        priceBasis: rate.isDevPlaceholder ? "DEV_PLACEHOLDER" : "CONFIRMED",
      },
    };
  }

  async packageDeparture(departureId: string, sel: Selection<"PACKAGE">, today: Date): Promise<PricedProduct> {
    const departure = await this.repo.findDeparture(departureId, today);
    if (!departure) throw notFound("Departure");
    const pkg = departure.package;
    const basis = pkg.pricingBasis;
    const travellers = sel.adults + sel.children;

    if (basis !== "PER_ROOM" && sel.rooms !== undefined) {
      throw new PricingRejection(422, "VALIDATION_FAILED", "rooms applies only to packages priced per room", "rooms");
    }
    // Supplements are stored in the package currency. A different departure currency would need a rate,
    // which is not configured for packages, so it is a configuration fault, not a client choice.
    if (departure.overrideCurrency !== null && departure.overrideCurrency !== pkg.currency) {
      throw new PricingConfigError(`departure ${departure.id} is priced in ${departure.overrideCurrency} but its package is ${pkg.currency}`);
    }
    const currency = pkg.currency;
    const money = (value: { toString(): string } | null) => (value === null ? null : parseMoney(value.toString(), currency));

    const free = freeUnits(departure.capacity, departure.bookedTravellers, departure.heldTravellers);
    const lines = packageLines({
      basis,
      basePrice: parseMoney((departure.priceOverride ?? pkg.basePrice).toString(), currency),
      singleSupplement: money(pkg.singleSupplement),
      childPrice: money(pkg.childPrice),
      extraPersonPrice: money(pkg.extraPersonPrice),
      minTravellers: pkg.minTravellers,
      maxTravellers: pkg.maxTravellers,
      adults: sel.adults,
      children: sel.children,
      rooms: sel.rooms ?? null,
    });
    if (free < travellers) throw new PricingRejection(409, "NOT_AVAILABLE", "not enough places are left on this departure");

    return {
      productType: "PACKAGE",
      productId: departure.id,
      currency,
      lines,
      notes: {},
      facts: { travellers },
      selection: { adults: sel.adults, children: sel.children, ...(sel.rooms !== undefined ? { rooms: sel.rooms } : {}) },
      product: {
        package: { id: pkg.id, slug: pkg.slug, title: pkg.title, pricingBasis: basis },
        departure: { id: departure.id, startsOn: isoOf(departure.startsOn) },
        cancellationPolicy: pkg.cancellationPolicy,
      },
    };
  }
}
