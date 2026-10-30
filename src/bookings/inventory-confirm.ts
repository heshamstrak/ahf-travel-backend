import { BookingItem } from "@prisma/client";
import { addDays } from "../common/business-date";
import {
  dayDate,
  guarded,
  isoDate,
  OnFirstMutation,
  runOrdered,
  Tx,
  HotelItemDetails,
  CarItemDetails,
  TransferItemDetails,
} from "./inventory-hold";

/**
 * Converts a held unit into a sold one: `held -> sold/booked`, total unchanged, so the existing
 * `held + sold/booked + blocked <= total` capacity CHECK is trivially satisfied by the write itself.
 * The primary guard against reaching this code twice for the same booking is the booking's own
 * guarded PENDING_PAYMENT -> CONFIRMED transition (bookings.repository.ts `guardedConfirm`), which
 * runs first in the same transaction. As defense-in-depth, each `*Inventory`/`TourSession`/
 * `PackageDeparture` table also carries a `heldUnits >= 0` (or `heldTravellers >= 0`) CHECK: were
 * this code ever reached for a hold that was already converted or released, decrementing it again
 * would drive that counter negative, Postgres would reject the UPDATE as a check violation, and
 * `guarded()` turns that into a clean 409 instead of a corrupted counter — exactly the mechanism
 * inventory-hold.ts already relies on for its own increments against the capacity CHECK.
 */

export interface HotelConfirm {
  roomId: string;
  nightDates: readonly string[];
  rooms: number;
}

export async function confirmHotel(tx: Tx, confirm: HotelConfirm, onFirst?: OnFirstMutation): Promise<void> {
  await runOrdered(confirm.nightDates, onFirst, (date) =>
    guarded(
      tx.roomInventory.update({
        where: { roomId_date: { roomId: confirm.roomId, date: dayDate(date) } },
        data: { heldUnits: { decrement: confirm.rooms }, soldUnits: { increment: confirm.rooms } },
      }),
      "This room's hold",
    ),
  );
}

export interface TourConfirm {
  tourSessionId: string;
  participants: number;
}

export async function confirmTour(tx: Tx, confirm: TourConfirm, onFirst?: OnFirstMutation): Promise<void> {
  await guarded(
    tx.tourSession.update({
      where: { id: confirm.tourSessionId },
      data: { heldUnits: { decrement: confirm.participants }, bookedUnits: { increment: confirm.participants } },
    }),
    "This departure's hold",
  );
  await onFirst?.();
}

export interface CarConfirm {
  carModelId: string;
  locationId: string;
  dayDates: readonly string[];
}

export async function confirmCar(tx: Tx, confirm: CarConfirm, onFirst?: OnFirstMutation): Promise<void> {
  await runOrdered(confirm.dayDates, onFirst, (date) =>
    guarded(
      tx.carInventory.update({
        where: { carModelId_locationId_date: { carModelId: confirm.carModelId, locationId: confirm.locationId, date: dayDate(date) } },
        data: { heldUnits: { decrement: 1 }, bookedUnits: { increment: 1 } },
      }),
      "This car's hold",
    ),
  );
}

export interface TransferConfirm {
  vehicleClassId: string;
  date: string;
}

export async function confirmTransfer(tx: Tx, confirm: TransferConfirm, onFirst?: OnFirstMutation): Promise<void> {
  await guarded(
    tx.transferCapacity.update({
      where: { vehicleClassId_date: { vehicleClassId: confirm.vehicleClassId, date: dayDate(confirm.date) } },
      data: { heldUnits: { decrement: 1 }, bookedUnits: { increment: 1 } },
    }),
    "This vehicle's hold",
  );
  await onFirst?.();
}

export interface PackageConfirm {
  packageDepartureId: string;
  travellers: number;
}

export async function confirmPackage(tx: Tx, confirm: PackageConfirm, onFirst?: OnFirstMutation): Promise<void> {
  await guarded(
    tx.packageDeparture.update({
      where: { id: confirm.packageDepartureId },
      data: { heldTravellers: { decrement: confirm.travellers }, bookedTravellers: { increment: confirm.travellers } },
    }),
    "This departure's hold",
  );
  await onFirst?.();
}

/**
 * Dispatches from a persisted, still-HELD BookingItem row to the right confirmX call, the same way
 * `releaseBookingItem` dispatches to releaseX. `onFirst` fires after the first row of a multi-row
 * (hotel/car) conversion, for failure-injection tests only.
 */
export async function confirmBookingItem(tx: Tx, item: BookingItem, onFirst?: OnFirstMutation): Promise<void> {
  switch (item.productType) {
    case "HOTEL": {
      const { nights } = item.details as unknown as HotelItemDetails;
      const nightDates = Array.from({ length: nights }, (_, i) => addDays(isoDate(item.startsAt), i));
      await confirmHotel(tx, { roomId: item.roomId!, nightDates, rooms: item.quantity }, onFirst);
      return;
    }
    case "TOUR":
      await confirmTour(tx, { tourSessionId: item.tourSessionId!, participants: item.quantity }, onFirst);
      return;
    case "CAR": {
      const { days } = item.details as unknown as CarItemDetails;
      const dayDates = Array.from({ length: days }, (_, i) => addDays(isoDate(item.startsAt), i));
      await confirmCar(tx, { carModelId: item.carModelId!, locationId: item.pickupLocationId!, dayDates }, onFirst);
      return;
    }
    case "TRANSFER": {
      const { vehicleClassId } = item.details as unknown as TransferItemDetails;
      await confirmTransfer(tx, { vehicleClassId, date: isoDate(item.startsAt) }, onFirst);
      return;
    }
    case "PACKAGE":
      await confirmPackage(tx, { packageDepartureId: item.packageDepartureId!, travellers: item.quantity }, onFirst);
      return;
  }
}
