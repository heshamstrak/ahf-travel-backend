import { dayDifference } from "../common/business-date";
import { PricingRejection } from "./errors";
import { Money, multiplyByCount, sum, zero, add } from "./money";

/** One priced component of the product itself (before rules). Amounts are exact minor units. */
export interface BaseLine {
  code: string;
  label: string;
  quantity: number;
  unit: Money;
  amount: Money;
}

export const MAX_STAY_NIGHTS = 30;
export const MAX_RENTAL_DAYS = 60;

/**
 * Splits a count across parts as evenly as possible. Earlier parts take the remainder, so
 * splitAcross(3, 2) is [2, 1]. Deterministic, so the same party always prices the same way.
 */
export function splitAcross(count: number, parts: number): number[] {
  const base = Math.floor(count / parts);
  const remainder = count % parts;
  return Array.from({ length: parts }, (_, index) => base + (index < remainder ? 1 : 0));
}

// ---------------------------------------------------------------- Hotels

export interface HotelRate {
  basePerNight: Money;
  baseOccupancy: number;
  maxAdults: number;
  maxChildren: number;
  extraAdultPerNight: Money | null;
  extraChildPerNight: Money | null;
}

export interface HotelStay {
  /** One entry per night, YYYY-MM-DD. */
  nightDates: string[];
  /** RoomRate overrides keyed by date. A night without one uses basePerNight. */
  nightlyOverrides: Map<string, Money>;
  rooms: number;
  adults: number;
  children: number;
  rate: HotelRate;
}

/** Per room, per night: nightlyRate(date) + extra adults and children. Summed over nights and rooms. */
export function hotelLines(stay: HotelStay): BaseLine[] {
  const { rate, rooms, adults, children } = stay;
  const nights = stay.nightDates.length;
  if (nights < 1) throw new PricingRejection(422, "VALIDATION_FAILED", "a stay needs at least one night", "checkOut");
  if (rooms < 1) throw new PricingRejection(422, "VALIDATION_FAILED", "at least one room is required", "rooms");
  if (adults < rooms) {
    throw new PricingRejection(422, "PARTY_NOT_ALLOWED", "every room needs at least one adult", "adults");
  }

  const adultsPerRoom = splitAcross(adults, rooms);
  const childrenPerRoom = splitAcross(children, rooms);

  let extraAdults = 0;
  let extraChildren = 0;
  for (let room = 0; room < rooms; room++) {
    const roomAdults = adultsPerRoom[room] ?? 0;
    const roomChildren = childrenPerRoom[room] ?? 0;
    if (roomAdults > rate.maxAdults) {
      throw new PricingRejection(422, "PARTY_NOT_ALLOWED", `a room holds at most ${rate.maxAdults} adults`, "adults");
    }
    if (roomChildren > rate.maxChildren) {
      throw new PricingRejection(422, "PARTY_NOT_ALLOWED", `a room holds at most ${rate.maxChildren} children`, "children");
    }
    extraAdults += Math.max(0, roomAdults - rate.baseOccupancy);
    extraChildren += roomChildren;
  }
  if (extraAdults > 0 && rate.extraAdultPerNight === null) {
    throw new PricingRejection(422, "PARTY_NOT_ALLOWED", "this rate does not allow adults above base occupancy", "adults");
  }
  if (extraChildren > 0 && rate.extraChildPerNight === null) {
    throw new PricingRejection(422, "PARTY_NOT_ALLOWED", "this rate does not allow children", "children");
  }

  // Room nights: the nightly rate is per room, so the stay total is the sum over nights.
  const perRoomStay = stay.nightDates.reduce<Money>((total, date) => add(total, stay.nightlyOverrides.get(date) ?? rate.basePerNight), zero(rate.basePerNight.currency));
  const lines: BaseLine[] = [
    { code: "ROOM", label: "Room (per room, for the stay)", quantity: rooms, unit: perRoomStay, amount: multiplyByCount(perRoomStay, rooms) },
  ];
  if (extraAdults > 0 && rate.extraAdultPerNight !== null) {
    const unit = rate.extraAdultPerNight;
    lines.push({
      code: "EXTRA_ADULT",
      label: "Adults above base occupancy (per night)",
      quantity: extraAdults * nights,
      unit,
      amount: multiplyByCount(unit, extraAdults * nights),
    });
  }
  if (extraChildren > 0 && rate.extraChildPerNight !== null) {
    const unit = rate.extraChildPerNight;
    lines.push({
      code: "EXTRA_CHILD",
      label: "Children (per night)",
      quantity: extraChildren * nights,
      unit,
      amount: multiplyByCount(unit, extraChildren * nights),
    });
  }
  return lines;
}

// ---------------------------------------------------------------- Tours

export interface TourInput {
  /** Price per participant (the session override when present). */
  unit: Money;
  participants: number;
  maxGroupSize: number;
}

export function tourLines(input: TourInput): BaseLine[] {
  if (input.participants < 1) {
    throw new PricingRejection(422, "VALIDATION_FAILED", "at least one participant is required", "participants");
  }
  if (input.participants > input.maxGroupSize) {
    throw new PricingRejection(422, "PARTY_NOT_ALLOWED", `this tour takes at most ${input.maxGroupSize} people`, "participants");
  }
  return [
    {
      code: "PARTICIPANT",
      label: "Price per participant",
      quantity: input.participants,
      unit: input.unit,
      amount: multiplyByCount(input.unit, input.participants),
    },
  ];
}

// ---------------------------------------------------------------- Cars

/**
 * Rental duration rule (documented): whole calendar days from the pick-up date to the drop-off date.
 * Drop-off must be after pick-up, the same rule the catalogue search applies. Maximum MAX_RENTAL_DAYS.
 */
export function rentalDays(pickupDate: string, dropoffDate: string): number {
  const days = dayDifference(pickupDate, dropoffDate);
  if (days < 1) throw new PricingRejection(422, "VALIDATION_FAILED", "drop-off must be after pick-up", "dropoffDate");
  if (days > MAX_RENTAL_DAYS) {
    throw new PricingRejection(422, "VALIDATION_FAILED", `a rental cannot exceed ${MAX_RENTAL_DAYS} days`, "dropoffDate");
  }
  return days;
}

/** Driver age is checked against the model's configured minimum. Refused, never priced. */
export function assertDriverAge(driverAge: number, minDriverAge: number): void {
  if (driverAge < minDriverAge) {
    throw new PricingRejection(422, "DRIVER_TOO_YOUNG", `the driver must be ${minDriverAge} or older for this car`, "driverAge");
  }
}

export function carLines(pricePerDay: Money, days: number): BaseLine[] {
  return [{ code: "DAILY_RATE", label: "Daily rate", quantity: days, unit: pricePerDay, amount: multiplyByCount(pricePerDay, days) }];
}

// ---------------------------------------------------------------- Transfers

export function transferLines(amount: Money): BaseLine[] {
  // One price per transfer (one vehicle), not per person.
  return [{ code: "VEHICLE", label: "Transfer, one vehicle", quantity: 1, unit: amount, amount }];
}

export function assertTransferParty(passengers: number, luggage: number, passengersMax: number, luggageMax: number): void {
  if (passengers > passengersMax) {
    throw new PricingRejection(422, "PARTY_NOT_ALLOWED", `this vehicle takes at most ${passengersMax} passengers`, "passengers");
  }
  if (luggage > luggageMax) {
    throw new PricingRejection(422, "PARTY_NOT_ALLOWED", `this vehicle takes at most ${luggageMax} bags`, "luggage");
  }
}

// ---------------------------------------------------------------- Packages

export type PackageBasis = "PER_PERSON" | "PER_ROOM" | "PER_PACKAGE";

export interface PackageInput {
  basis: PackageBasis;
  /** Departure override when present, otherwise the package base price. */
  basePrice: Money;
  singleSupplement: Money | null;
  childPrice: Money | null;
  extraPersonPrice: Money | null;
  minTravellers: number;
  maxTravellers: number;
  adults: number;
  children: number;
  /** Required for PER_ROOM. Each room holds two people at base occupancy. */
  rooms: number | null;
}

export const PER_ROOM_BASE_OCCUPANCY = 2;

export function packageLines(input: PackageInput): BaseLine[] {
  const travellers = input.adults + input.children;
  if (input.adults < 1) throw new PricingRejection(422, "VALIDATION_FAILED", "at least one adult is required", "adults");
  if (travellers < input.minTravellers) {
    throw new PricingRejection(422, "PARTY_NOT_ALLOWED", `this package needs at least ${input.minTravellers} travellers`, "adults");
  }

  switch (input.basis) {
    case "PER_PERSON": {
      if (travellers > input.maxTravellers) {
        throw new PricingRejection(422, "PARTY_NOT_ALLOWED", `this package takes at most ${input.maxTravellers} travellers`, "adults");
      }
      const lines: BaseLine[] = [
        { code: "ADULT", label: "Adult, per person", quantity: input.adults, unit: input.basePrice, amount: multiplyByCount(input.basePrice, input.adults) },
      ];
      if (input.children > 0) {
        if (input.childPrice === null) {
          throw new PricingRejection(422, "PARTY_NOT_ALLOWED", "children are not offered on this package", "children");
        }
        lines.push({ code: "CHILD", label: "Child, per person", quantity: input.children, unit: input.childPrice, amount: multiplyByCount(input.childPrice, input.children) });
      }
      // A traveller alone pays the single supplement when the package defines one. Null means none.
      if (travellers === 1 && input.singleSupplement !== null) {
        lines.push({ code: "SINGLE_SUPPLEMENT", label: "Single traveller supplement", quantity: 1, unit: input.singleSupplement, amount: input.singleSupplement });
      }
      return lines;
    }
    case "PER_ROOM": {
      const rooms = input.rooms;
      if (rooms === null || rooms < 1) {
        throw new PricingRejection(422, "VALIDATION_FAILED", "this package is priced per room, so rooms is required", "rooms");
      }
      if (travellers < rooms) {
        throw new PricingRejection(422, "PARTY_NOT_ALLOWED", "every room needs at least one traveller", "rooms");
      }
      if (travellers > input.maxTravellers) {
        throw new PricingRejection(422, "PARTY_NOT_ALLOWED", `this package takes at most ${input.maxTravellers} travellers`, "adults");
      }
      const lines: BaseLine[] = [
        { code: "ROOM", label: "Room, two people at base occupancy", quantity: rooms, unit: input.basePrice, amount: multiplyByCount(input.basePrice, rooms) },
      ];
      const extra = Math.max(0, travellers - rooms * PER_ROOM_BASE_OCCUPANCY);
      if (extra > 0) {
        if (input.extraPersonPrice === null) {
          throw new PricingRejection(422, "PARTY_NOT_ALLOWED", "this package does not allow more people per room", "adults");
        }
        lines.push({ code: "EXTRA_PERSON", label: "Extra person above base occupancy", quantity: extra, unit: input.extraPersonPrice, amount: multiplyByCount(input.extraPersonPrice, extra) });
      }
      return lines;
    }
    case "PER_PACKAGE": {
      const lines: BaseLine[] = [
        { code: "PACKAGE", label: "Package, flat for the group", quantity: 1, unit: input.basePrice, amount: input.basePrice },
      ];
      const beyond = Math.max(0, travellers - input.maxTravellers);
      if (beyond > 0) {
        if (input.extraPersonPrice === null) {
          throw new PricingRejection(422, "PARTY_NOT_ALLOWED", `this package takes at most ${input.maxTravellers} travellers`, "adults");
        }
        lines.push({ code: "EXTRA_PERSON", label: "Extra person beyond the group size", quantity: beyond, unit: input.extraPersonPrice, amount: multiplyByCount(input.extraPersonPrice, beyond) });
      }
      return lines;
    }
  }
}

/** Sum of base line amounts, in the currency of the product. */
export function baseSubtotal(lines: BaseLine[], currency: string): Money {
  return sum(lines.map((line) => line.amount), currency);
}
