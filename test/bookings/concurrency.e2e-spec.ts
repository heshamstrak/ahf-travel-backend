import { createTestApp, TestApp } from "../support/app";
import { loadCatalogue } from "../catalogue/support";
import {
  bookingBody,
  carQuoteBody,
  catalogueIds,
  createQuote,
  hotelQuoteBody,
  isoDay,
  newIdempotencyKey,
  packageQuoteBody,
  raceBookings,
  setCarFree,
  restoreSharedFixtures,
  setDepartureFree,
  setRoomFree,
  setTourFree,
  setTransferFree,
  tourQuoteBody,
  transferQuoteBody,
} from "./support";

/** Real races are not always won by the same side. Repeating catches a guard that only works "by luck". */
const REPEATS = 5;

interface Outcome {
  status: number;
  body: { code?: string; id?: string };
}

function splitOutcomes(results: Outcome[]): { won: Outcome[]; lost: Outcome[] } {
  return { won: results.filter((r) => r.status === 201), lost: results.filter((r) => r.status !== 201) };
}

describe("Booking concurrency against real PostgreSQL (integration)", () => {
  let t: TestApp;
  let ids: Awaited<ReturnType<typeof catalogueIds>>;

  beforeAll(async () => {
    t = await createTestApp();
    await loadCatalogue(t.prisma);
    ids = await catalogueIds(t.prisma);
  });

  afterAll(async () => {
    // These tests deliberately make nileSession, pyramidsSession and cairoWeekendDeparture scarce.
    // Other suites in the same run read their exact remaining capacity, so put it back.
    await restoreSharedFixtures(t, ids);
    await t.close();
  });

  describe("last unit of inventory: exactly one of two simultaneous bookings succeeds", () => {
    it("hotel: the last room", async () => {
      const checkIn = isoDay(25);
      const checkOut = isoDay(26);
      for (let i = 0; i < REPEATS; i++) {
        await setRoomFree(t, ids.flexPyramidRate.roomId, checkIn, 1);
        const [quoteA, quoteB] = await Promise.all([
          createQuote(t, hotelQuoteBody(ids.flexPyramidRate.id, { checkIn, checkOut })),
          createQuote(t, hotelQuoteBody(ids.flexPyramidRate.id, { checkIn, checkOut })),
        ]);
        const results = (await raceBookings(t, [
          { body: bookingBody(quoteA.id), key: newIdempotencyKey() },
          { body: bookingBody(quoteB.id), key: newIdempotencyKey() },
        ])) as unknown as Outcome[];

        const { won, lost } = splitOutcomes(results);
        expect(won).toHaveLength(1);
        expect(lost).toHaveLength(1);
        expect(lost[0]!.status).toBe(409);
        expect(lost[0]!.body.code).toBe("NOT_AVAILABLE");

        const row = await t.prisma.roomInventory.findUniqueOrThrow({
          where: { roomId_date: { roomId: ids.flexPyramidRate.roomId, date: new Date(`${checkIn}T00:00:00Z`) } },
        });
        expect(row.heldUnits).toBe(1);
        expect(row.heldUnits + row.soldUnits + row.blockedUnits).toBeLessThanOrEqual(row.totalUnits);
      }
    });

    it("tour: the last seat", async () => {
      for (let i = 0; i < REPEATS; i++) {
        await setTourFree(t, ids.nileSession.id, 1);
        const [quoteA, quoteB] = await Promise.all([createQuote(t, tourQuoteBody(ids.nileSession.id)), createQuote(t, tourQuoteBody(ids.nileSession.id))]);
        const results = (await raceBookings(t, [
          { body: bookingBody(quoteA.id), key: newIdempotencyKey() },
          { body: bookingBody(quoteB.id), key: newIdempotencyKey() },
        ])) as unknown as Outcome[];

        const { won, lost } = splitOutcomes(results);
        expect(won).toHaveLength(1);
        expect(lost).toHaveLength(1);
        expect(lost[0]!.body.code).toBe("NOT_AVAILABLE");

        const row = await t.prisma.tourSession.findUniqueOrThrow({ where: { id: ids.nileSession.id } });
        expect(row.heldUnits).toBe(1);
        expect(row.heldUnits + row.bookedUnits).toBeLessThanOrEqual(row.capacity);
      }
    });

    it("car: the last vehicle", async () => {
      const pickupDate = isoDay(20);
      const dropoffDate = isoDay(21);
      for (let i = 0; i < REPEATS; i++) {
        await setCarFree(t, ids.corollaCar.id, ids.caiAirport.id, pickupDate, 1);
        const [quoteA, quoteB] = await Promise.all([
          createQuote(t, carQuoteBody(ids.corollaCar.id, ids.caiAirport.id, { pickupDate, dropoffDate })),
          createQuote(t, carQuoteBody(ids.corollaCar.id, ids.caiAirport.id, { pickupDate, dropoffDate })),
        ]);
        const results = (await raceBookings(t, [
          { body: bookingBody(quoteA.id), key: newIdempotencyKey() },
          { body: bookingBody(quoteB.id), key: newIdempotencyKey() },
        ])) as unknown as Outcome[];

        const { won, lost } = splitOutcomes(results);
        expect(won).toHaveLength(1);
        expect(lost).toHaveLength(1);
        expect(lost[0]!.body.code).toBe("NOT_AVAILABLE");

        const row = await t.prisma.carInventory.findUniqueOrThrow({
          where: { carModelId_locationId_date: { carModelId: ids.corollaCar.id, locationId: ids.caiAirport.id, date: new Date(`${pickupDate}T00:00:00Z`) } },
        });
        expect(row.heldUnits).toBe(1);
        expect(row.heldUnits + row.bookedUnits + row.blockedUnits).toBeLessThanOrEqual(row.totalUnits);
      }
    });

    it("transfer: the last vehicle on the route", async () => {
      const date = isoDay(22);
      for (let i = 0; i < REPEATS; i++) {
        await setTransferFree(t, ids.sedanRoute.vehicleClassId, date, 1);
        const [quoteA, quoteB] = await Promise.all([
          createQuote(t, transferQuoteBody(ids.sedanRoute.id, { date })),
          createQuote(t, transferQuoteBody(ids.sedanRoute.id, { date })),
        ]);
        const results = (await raceBookings(t, [
          { body: bookingBody(quoteA.id), key: newIdempotencyKey() },
          { body: bookingBody(quoteB.id), key: newIdempotencyKey() },
        ])) as unknown as Outcome[];

        const { won, lost } = splitOutcomes(results);
        expect(won).toHaveLength(1);
        expect(lost).toHaveLength(1);
        expect(lost[0]!.body.code).toBe("NOT_AVAILABLE");

        const row = await t.prisma.transferCapacity.findUniqueOrThrow({
          where: { vehicleClassId_date: { vehicleClassId: ids.sedanRoute.vehicleClassId, date: new Date(`${date}T00:00:00Z`) } },
        });
        expect(row.heldUnits).toBe(1);
        expect(row.heldUnits + row.bookedUnits).toBeLessThanOrEqual(row.totalUnits);
      }
    });

    it("package: the last allotment place", async () => {
      for (let i = 0; i < REPEATS; i++) {
        await setDepartureFree(t, ids.cairoWeekendDeparture.id, 1);
        const [quoteA, quoteB] = await Promise.all([
          createQuote(t, packageQuoteBody(ids.cairoWeekendDeparture.id, { adults: 1 })),
          createQuote(t, packageQuoteBody(ids.cairoWeekendDeparture.id, { adults: 1 })),
        ]);
        const results = (await raceBookings(t, [
          { body: bookingBody(quoteA.id), key: newIdempotencyKey() },
          { body: bookingBody(quoteB.id), key: newIdempotencyKey() },
        ])) as unknown as Outcome[];

        const { won, lost } = splitOutcomes(results);
        expect(won).toHaveLength(1);
        expect(lost).toHaveLength(1);
        expect(lost[0]!.body.code).toBe("NOT_AVAILABLE");

        const row = await t.prisma.packageDeparture.findUniqueOrThrow({ where: { id: ids.cairoWeekendDeparture.id } });
        expect(row.heldTravellers).toBe(1);
        expect(row.heldTravellers + row.bookedTravellers).toBeLessThanOrEqual(row.capacity);
      }
    });
  });

  describe("same quote, different idempotency keys", () => {
    it("still produces only one booking, however the race falls", async () => {
      const checkIn = isoDay(25);
      const checkOut = isoDay(26);
      for (let i = 0; i < REPEATS; i++) {
        // Plenty of rooms: the only thing that can stop the second request here is the quote guard,
        // not inventory scarcity.
        await setRoomFree(t, ids.flexPyramidRate.roomId, checkIn, 5);
        const quote = await createQuote(t, hotelQuoteBody(ids.flexPyramidRate.id, { checkIn, checkOut }));
        const results = (await raceBookings(t, [
          { body: bookingBody(quote.id), key: newIdempotencyKey() },
          { body: bookingBody(quote.id), key: newIdempotencyKey() },
        ])) as unknown as Outcome[];

        const { won, lost } = splitOutcomes(results);
        expect(won).toHaveLength(1);
        expect(lost).toHaveLength(1);
        expect(lost[0]!.body.code).toBe("QUOTE_ALREADY_CONSUMED");

        const count = await t.prisma.booking.count({ where: { quoteId: quote.id } });
        expect(count).toBe(1);
      }
    });
  });

  describe("same idempotency key, identical requests", () => {
    it("creates exactly one booking and both requests resolve to it", async () => {
      const checkIn = isoDay(25);
      const checkOut = isoDay(26);
      for (let i = 0; i < REPEATS; i++) {
        await setRoomFree(t, ids.flexPyramidRate.roomId, checkIn, 5);
        const quote = await createQuote(t, hotelQuoteBody(ids.flexPyramidRate.id, { checkIn, checkOut }));
        const key = newIdempotencyKey();
        const body = bookingBody(quote.id);
        const results = (await raceBookings(t, [
          { body, key },
          { body, key },
        ])) as unknown as Outcome[];

        expect(results[0]!.status).toBe(201);
        expect(results[1]!.status).toBe(201);
        expect(results[0]!.body.id).toBe(results[1]!.body.id);

        const count = await t.prisma.booking.count({ where: { quoteId: quote.id } });
        expect(count).toBe(1);
        const keyCount = await t.prisma.idempotencyKey.count({ where: { key } });
        expect(keyCount).toBe(1);
      }
    });
  });
});
