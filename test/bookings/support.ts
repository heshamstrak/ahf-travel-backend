import { randomUUID } from "crypto";
import request from "supertest";
import type { App } from "supertest/types";
import { createTestApp, TestApp } from "../support/app";
import { catalogueIds, createUser, expectProblem, isoDay, PREFIX, QUOTES, signIn } from "../quotes/support";
import { BookingTransactionHooks } from "../../src/bookings/failure-injection";

export { catalogueIds, createUser, expectProblem, isoDay, PREFIX, QUOTES, signIn };

export function api(t: TestApp) {
  return request(t.app.getHttpServer() as App);
}

export const BOOKINGS = `${PREFIX}/bookings`;

/** Boots a fresh application with BookingTransactionHooks replaced by the given instance. Used only
 *  by failure-injection tests: the override lives in this test's own TestingModuleBuilder, never in
 *  production wiring. */
export function createTestAppWithHook(hook: BookingTransactionHooks): Promise<TestApp> {
  return createTestApp({}, (builder) => builder.overrideProvider(BookingTransactionHooks).useValue(hook));
}

export function newIdempotencyKey(): string {
  return randomUUID();
}

export function customer(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Jane",
    lastName: "Doe",
    email: `jane-${randomUUID().slice(0, 8)}@example.test`,
    phone: "+201234567890",
    countryCode: "EG",
    ...overrides,
  };
}

export function bookingBody(quoteId: string, overrides: Record<string, unknown> = {}) {
  return { quoteId, customer: customer(), ...overrides };
}

/** Creates a real quote over HTTP, exactly as a client would, and returns its body (id, totals, etc.). */
export async function createQuote(t: TestApp, body: Record<string, unknown>, bearer?: string) {
  const req = api(t).post(QUOTES);
  if (bearer) req.set("Authorization", `Bearer ${bearer}`);
  const res = await req.send(body).expect(201);
  return res.body as { id: string; guestToken?: string; totals: { total: string } };
}

export function hotelQuoteBody(rateId: string, overrides: Record<string, unknown> = {}) {
  return {
    productType: "HOTEL",
    productId: rateId,
    selection: { checkIn: isoDay(25), checkOut: isoDay(26), rooms: 1, adults: 2, children: 0, ...overrides },
  };
}

export function tourQuoteBody(sessionId: string, overrides: Record<string, unknown> = {}) {
  return { productType: "TOUR", productId: sessionId, selection: { participants: 1, ...overrides } };
}

export function carQuoteBody(carModelId: string, pickupLocationId: string, overrides: Record<string, unknown> = {}) {
  return {
    productType: "CAR",
    productId: carModelId,
    selection: { pickupDate: isoDay(25), dropoffDate: isoDay(26), pickupLocationId, driverAge: 30, ...overrides },
  };
}

export function transferQuoteBody(rateId: string, overrides: Record<string, unknown> = {}) {
  return { productType: "TRANSFER", productId: rateId, selection: { date: isoDay(25), passengers: 1, luggage: 0, ...overrides } };
}

export function packageQuoteBody(departureId: string, overrides: Record<string, unknown> = {}) {
  return { productType: "PACKAGE", productId: departureId, selection: { adults: 1, children: 0, ...overrides } };
}

/** Fires two booking requests at the same instant, against the same running application. Prisma
 *  gives each its own pooled database connection, so this is a genuine concurrent write race at
 *  the PostgreSQL level, not a simulation. */
export async function raceBookings(
  t: TestApp,
  requests: { body: Record<string, unknown>; key: string; bearer?: string }[],
) {
  return Promise.all(
    requests.map(({ body, key, bearer }) => {
      const req = api(t).post(BOOKINGS).set("Idempotency-Key", key);
      if (bearer) req.set("Authorization", `Bearer ${bearer}`);
      return req.send(body);
    }),
  );
}

const DAY = (date: string) => new Date(`${date}T00:00:00Z`);

/** Pins a RoomInventory row to an exact number of free units, ignoring whatever was there before. */
export async function setRoomFree(t: TestApp, roomId: string, date: string, free: number): Promise<void> {
  const row = await t.prisma.roomInventory.findUniqueOrThrow({ where: { roomId_date: { roomId, date: DAY(date) } } });
  await t.prisma.roomInventory.update({
    where: { roomId_date: { roomId, date: DAY(date) } },
    data: { heldUnits: 0, blockedUnits: 0, soldUnits: row.totalUnits - free },
  });
}

export async function setTourFree(t: TestApp, tourSessionId: string, free: number): Promise<void> {
  const row = await t.prisma.tourSession.findUniqueOrThrow({ where: { id: tourSessionId } });
  await t.prisma.tourSession.update({ where: { id: tourSessionId }, data: { heldUnits: 0, bookedUnits: row.capacity - free } });
}

export async function setCarFree(t: TestApp, carModelId: string, locationId: string, date: string, free: number): Promise<void> {
  const where = { carModelId_locationId_date: { carModelId, locationId, date: DAY(date) } };
  const row = await t.prisma.carInventory.findUniqueOrThrow({ where });
  await t.prisma.carInventory.update({ where, data: { heldUnits: 0, blockedUnits: 0, bookedUnits: row.totalUnits - free } });
}

export async function setTransferFree(t: TestApp, vehicleClassId: string, date: string, free: number): Promise<void> {
  const where = { vehicleClassId_date: { vehicleClassId, date: DAY(date) } };
  const row = await t.prisma.transferCapacity.findUniqueOrThrow({ where });
  await t.prisma.transferCapacity.update({ where, data: { heldUnits: 0, bookedUnits: row.totalUnits - free } });
}

export async function setDepartureFree(t: TestApp, departureId: string, free: number): Promise<void> {
  const row = await t.prisma.packageDeparture.findUniqueOrThrow({ where: { id: departureId } });
  await t.prisma.packageDeparture.update({ where: { id: departureId }, data: { heldTravellers: 0, bookedTravellers: row.capacity - free } });
}

/**
 * Tour sessions and package departures are shared with the Milestone 2 and 3 suites, which read
 * their exact remaining capacity (`remainingUnits`, `remainingTravellers`). Any M4 test that makes
 * one of these scarce on purpose (the "last unit" races) must put it back to fully free once it is
 * done, or a later suite in the same run sees an already-exhausted fixture. Hotel, car and transfer
 * resources are not read that way elsewhere, so they do not need this restoration.
 */
export async function restoreSharedFixtures(t: TestApp, ids: Awaited<ReturnType<typeof catalogueIds>>): Promise<void> {
  for (const sessionId of [ids.nileSession.id, ids.pyramidsSession.id]) {
    const row = await t.prisma.tourSession.findUniqueOrThrow({ where: { id: sessionId } });
    await setTourFree(t, sessionId, row.capacity);
  }
  const departure = await t.prisma.packageDeparture.findUniqueOrThrow({ where: { id: ids.cairoWeekendDeparture.id } });
  await setDepartureFree(t, ids.cairoWeekendDeparture.id, departure.capacity);
}
