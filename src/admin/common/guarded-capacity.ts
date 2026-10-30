import { Prisma } from "@prisma/client";
import { PricingRejection } from "../../pricing/errors";

type Tx = Prisma.TransactionClient;

/**
 * Every function here is a single atomic, guarded UPDATE/UPSERT: the new total is only ever
 * written when it would not fall below what is already held, sold/booked and blocked for that
 * row. There is no read-then-decide in Node — the database evaluates the guard and the write in
 * one statement, the same discipline Milestones 1–5 use for hold/release/confirm. A day that does
 * not have an inventory row yet (extending the window into a new future date) is created fresh,
 * with the guard only applying to an existing row.
 */

const dayDate = (date: string): Date => new Date(`${date}T00:00:00Z`);

export async function guardedSetRoomInventoryTotal(tx: Tx, roomId: string, date: string, total: number): Promise<void> {
  const rows = await tx.$queryRaw<{ roomId: string }[]>`
    INSERT INTO "RoomInventory" ("roomId", "date", "totalUnits", "heldUnits", "soldUnits", "blockedUnits", "version", "updatedAt")
    VALUES (${roomId}::uuid, ${dayDate(date)}, ${total}, 0, 0, 0, 0, now())
    ON CONFLICT ("roomId", "date") DO UPDATE
      SET "totalUnits" = EXCLUDED."totalUnits", "version" = "RoomInventory"."version" + 1, "updatedAt" = now()
      WHERE "RoomInventory"."heldUnits" + "RoomInventory"."soldUnits" + "RoomInventory"."blockedUnits" <= EXCLUDED."totalUnits"
    RETURNING "roomId"`;
  if (rows.length === 0) {
    throw new PricingRejection(409, "INVENTORY_BELOW_COMMITTED", `Cannot set ${date} below the rooms already held, sold or blocked`);
  }
}

export async function guardedSetCarInventoryTotal(tx: Tx, carModelId: string, locationId: string, date: string, total: number): Promise<void> {
  const rows = await tx.$queryRaw<{ carModelId: string }[]>`
    INSERT INTO "CarInventory" ("carModelId", "locationId", "date", "totalUnits", "heldUnits", "bookedUnits", "blockedUnits", "version", "updatedAt")
    VALUES (${carModelId}::uuid, ${locationId}::uuid, ${dayDate(date)}, ${total}, 0, 0, 0, 0, now())
    ON CONFLICT ("carModelId", "locationId", "date") DO UPDATE
      SET "totalUnits" = EXCLUDED."totalUnits", "version" = "CarInventory"."version" + 1, "updatedAt" = now()
      WHERE "CarInventory"."heldUnits" + "CarInventory"."bookedUnits" + "CarInventory"."blockedUnits" <= EXCLUDED."totalUnits"
    RETURNING "carModelId"`;
  if (rows.length === 0) {
    throw new PricingRejection(409, "INVENTORY_BELOW_COMMITTED", `Cannot set ${date} below the cars already held, booked or blocked`);
  }
}

export async function guardedSetTransferCapacityTotal(tx: Tx, vehicleClassId: string, date: string, total: number): Promise<void> {
  const rows = await tx.$queryRaw<{ vehicleClassId: string }[]>`
    INSERT INTO "TransferCapacity" ("vehicleClassId", "date", "totalUnits", "heldUnits", "bookedUnits", "version")
    VALUES (${vehicleClassId}::uuid, ${dayDate(date)}, ${total}, 0, 0, 0)
    ON CONFLICT ("vehicleClassId", "date") DO UPDATE
      SET "totalUnits" = EXCLUDED."totalUnits", "version" = "TransferCapacity"."version" + 1
      WHERE "TransferCapacity"."heldUnits" + "TransferCapacity"."bookedUnits" <= EXCLUDED."totalUnits"
    RETURNING "vehicleClassId"`;
  if (rows.length === 0) {
    throw new PricingRejection(409, "INVENTORY_BELOW_COMMITTED", `Cannot set ${date} below the vehicles already held or booked`);
  }
}

export async function guardedSetTourSessionCapacity(tx: Tx, sessionId: string, capacity: number): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "TourSession"
       SET "capacity" = ${capacity}, "version" = "version" + 1
     WHERE "id" = ${sessionId}::uuid
       AND "heldUnits" + "bookedUnits" <= ${capacity}
     RETURNING "id"`;
  if (rows.length === 0) {
    throw new PricingRejection(409, "INVENTORY_BELOW_COMMITTED", "Cannot set capacity below the seats already held or booked");
  }
}

export async function guardedSetPackageDepartureCapacity(tx: Tx, departureId: string, capacity: number): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "PackageDeparture"
       SET "capacity" = ${capacity}, "version" = "version" + 1
     WHERE "id" = ${departureId}::uuid
       AND "heldTravellers" + "bookedTravellers" <= ${capacity}
     RETURNING "id"`;
  if (rows.length === 0) {
    throw new PricingRejection(409, "INVENTORY_BELOW_COMMITTED", "Cannot set capacity below the places already held or booked");
  }
}
