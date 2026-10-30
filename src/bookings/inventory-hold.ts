import { BookingItem, Prisma } from "@prisma/client";
import { addDays } from "../common/business-date";
import { PricingRejection } from "../pricing/errors";

export type Tx = Prisma.TransactionClient;
/** Called once, right after the first successful guarded mutation of a hold or confirmation. Lets
 *  failure-injection tests target exactly "the first of several mutations" for a multi-night or
 *  multi-day operation. */
export type OnFirstMutation = (() => Promise<void>) | undefined;

function isRecordNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

/** Postgres raises 23514 (check_violation) for a row that would break an invariant. Prisma does not
 *  model CHECK constraints as a specific error code, so the message is what M1's own tests match on. */
function isCheckViolation(error: unknown): boolean {
  return error instanceof Error && /violates check constraint/.test(error.message);
}

/**
 * The database is the only authority on whether this increment is allowed. There is no read,
 * decide-in-Node, then write: the UPDATE always runs, and either the row does not exist (P2025) or
 * the row's own CHECK constraint (held + sold/booked + blocked <= total) rejects the new value.
 * Both become the same public outcome: the unit is no longer available.
 */
export async function guarded<T>(promise: Promise<T>, what: string): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (isRecordNotFound(error) || isCheckViolation(error)) {
      throw new PricingRejection(409, "NOT_AVAILABLE", `${what} is no longer available`);
    }
    throw error;
  }
}

export const dayDate = (date: string): Date => new Date(`${date}T00:00:00Z`);
export const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

/** Ascending order is a fixed, deterministic order every transaction uses, so two bookings that touch
 *  overlapping nights or days always acquire their row locks in the same relative order. That is what
 *  prevents a deadlock between them; it does not, by itself, decide who wins — the CHECK constraint does. */
export const ascending = (dates: readonly string[]): string[] => [...dates].sort();

export async function runOrdered(dates: readonly string[], onFirst: OnFirstMutation, mutate: (date: string) => Promise<unknown>): Promise<void> {
  const ordered = ascending(dates);
  for (let i = 0; i < ordered.length; i++) {
    await mutate(ordered[i]);
    if (i === 0) await onFirst?.();
  }
}

// ---------------------------------------------------------------- Hotel

export interface HotelHold {
  roomId: string;
  nightDates: readonly string[];
  rooms: number;
}

export async function holdHotel(tx: Tx, hold: HotelHold, onFirst?: OnFirstMutation): Promise<void> {
  await runOrdered(hold.nightDates, onFirst, (date) =>
    guarded(
      tx.roomInventory.update({
        where: { roomId_date: { roomId: hold.roomId, date: dayDate(date) } },
        data: { heldUnits: { increment: hold.rooms } },
      }),
      "This room",
    ),
  );
}

export async function releaseHotel(tx: Tx, hold: HotelHold): Promise<void> {
  for (const date of ascending(hold.nightDates)) {
    await tx.roomInventory.update({
      where: { roomId_date: { roomId: hold.roomId, date: dayDate(date) } },
      data: { heldUnits: { decrement: hold.rooms } },
    });
  }
}

// ---------------------------------------------------------------- Tours

export interface TourHold {
  tourSessionId: string;
  participants: number;
}

export async function holdTour(tx: Tx, hold: TourHold, onFirst?: OnFirstMutation): Promise<void> {
  await guarded(
    tx.tourSession.update({ where: { id: hold.tourSessionId }, data: { heldUnits: { increment: hold.participants } } }),
    "This departure",
  );
  await onFirst?.();
}

export async function releaseTour(tx: Tx, hold: TourHold): Promise<void> {
  await tx.tourSession.update({ where: { id: hold.tourSessionId }, data: { heldUnits: { decrement: hold.participants } } });
}

// ---------------------------------------------------------------- Cars

export interface CarHold {
  carModelId: string;
  locationId: string;
  dayDates: readonly string[];
}

export async function holdCar(tx: Tx, hold: CarHold, onFirst?: OnFirstMutation): Promise<void> {
  await runOrdered(hold.dayDates, onFirst, (date) =>
    guarded(
      tx.carInventory.update({
        where: { carModelId_locationId_date: { carModelId: hold.carModelId, locationId: hold.locationId, date: dayDate(date) } },
        data: { heldUnits: { increment: 1 } },
      }),
      "This car",
    ),
  );
}

export async function releaseCar(tx: Tx, hold: CarHold): Promise<void> {
  for (const date of ascending(hold.dayDates)) {
    await tx.carInventory.update({
      where: { carModelId_locationId_date: { carModelId: hold.carModelId, locationId: hold.locationId, date: dayDate(date) } },
      data: { heldUnits: { decrement: 1 } },
    });
  }
}

// ---------------------------------------------------------------- Transfers

export interface TransferHold {
  vehicleClassId: string;
  date: string;
}

export async function holdTransfer(tx: Tx, hold: TransferHold, onFirst?: OnFirstMutation): Promise<void> {
  await guarded(
    tx.transferCapacity.update({
      where: { vehicleClassId_date: { vehicleClassId: hold.vehicleClassId, date: dayDate(hold.date) } },
      data: { heldUnits: { increment: 1 } },
    }),
    "This vehicle",
  );
  await onFirst?.();
}

export async function releaseTransfer(tx: Tx, hold: TransferHold): Promise<void> {
  await tx.transferCapacity.update({
    where: { vehicleClassId_date: { vehicleClassId: hold.vehicleClassId, date: dayDate(hold.date) } },
    data: { heldUnits: { decrement: 1 } },
  });
}

// ---------------------------------------------------------------- Packages
// V1 package inventory holds only the PackageDeparture allotment. It does not reserve the
// underlying hotel, tour or transfer components that make up the package — those remain
// separately bookable and are not protected by this hold. This is a documented V1 limitation,
// carried over unchanged from the approved architecture (section 21, Revision 3).

export interface PackageHold {
  packageDepartureId: string;
  travellers: number;
}

export async function holdPackage(tx: Tx, hold: PackageHold, onFirst?: OnFirstMutation): Promise<void> {
  await guarded(
    tx.packageDeparture.update({ where: { id: hold.packageDepartureId }, data: { heldTravellers: { increment: hold.travellers } } }),
    "This departure",
  );
  await onFirst?.();
}

export async function releasePackage(tx: Tx, hold: PackageHold): Promise<void> {
  await tx.packageDeparture.update({
    where: { id: hold.packageDepartureId },
    data: { heldTravellers: { decrement: hold.travellers } },
  });
}

// ---------------------------------------------------------------- Release from a persisted item
// Used by cancellation and by the expiry worker: both start from a BookingItem row that already
// exists, not from a fresh quote, so the resource ids and quantities come straight from that row.

/** The product-specific fields `details` must carry so a persisted item can be released later. */
export interface HotelItemDetails {
  nights: number;
}
export interface CarItemDetails {
  days: number;
}
export interface TransferItemDetails {
  vehicleClassId: string;
}

export async function releaseBookingItem(tx: Tx, item: BookingItem): Promise<void> {
  switch (item.productType) {
    case "HOTEL": {
      const { nights } = item.details as unknown as HotelItemDetails;
      const nightDates = Array.from({ length: nights }, (_, i) => addDays(isoDate(item.startsAt), i));
      await releaseHotel(tx, { roomId: item.roomId!, nightDates, rooms: item.quantity });
      return;
    }
    case "TOUR":
      await releaseTour(tx, { tourSessionId: item.tourSessionId!, participants: item.quantity });
      return;
    case "CAR": {
      const { days } = item.details as unknown as CarItemDetails;
      const dayDates = Array.from({ length: days }, (_, i) => addDays(isoDate(item.startsAt), i));
      await releaseCar(tx, { carModelId: item.carModelId!, locationId: item.pickupLocationId!, dayDates });
      return;
    }
    case "TRANSFER": {
      const { vehicleClassId } = item.details as unknown as TransferItemDetails;
      await releaseTransfer(tx, { vehicleClassId, date: isoDate(item.startsAt) });
      return;
    }
    case "PACKAGE":
      await releasePackage(tx, { packageDepartureId: item.packageDepartureId!, travellers: item.quantity });
      return;
  }
}
