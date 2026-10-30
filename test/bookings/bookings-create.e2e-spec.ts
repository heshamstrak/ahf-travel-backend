import { createTestApp, TestApp } from "../support/app";
import { loadCatalogue } from "../catalogue/support";
import { Clock } from "../../src/common/clock";
import { BOOKING_REFERENCE_PATTERN } from "../../src/bookings/booking-reference";
import {
  api,
  BOOKINGS,
  bookingBody,
  carQuoteBody,
  catalogueIds,
  createQuote,
  createUser,
  customer,
  expectProblem,
  hotelQuoteBody,
  isoDay,
  newIdempotencyKey,
  packageQuoteBody,
  restoreSharedFixtures,
  setCarFree,
  setDepartureFree,
  setRoomFree,
  setTourFree,
  setTransferFree,
  signIn,
  tourQuoteBody,
  transferQuoteBody,
} from "./support";

/** Every happy-path test resets its own resource to generous headroom first, so this file's result
 *  never depends on what ran before it, in this file or any other. 3 is safe for every resource this
 *  file touches: car inventory is seeded with only 3 units per branch per day, the tightest of them. */
const PLENTY = 3;

async function freshHotelQuote(
  t: TestApp,
  ids: Awaited<ReturnType<typeof catalogueIds>>,
  checkIn: string,
  checkOut: string,
  bearer?: string,
) {
  await setRoomFree(t, ids.flexPyramidRate.roomId, checkIn, PLENTY);
  return createQuote(t, hotelQuoteBody(ids.flexPyramidRate.id, { checkIn, checkOut }), bearer);
}

describe("Booking creation (integration)", () => {
  let t: TestApp;
  let ids: Awaited<ReturnType<typeof catalogueIds>>;

  beforeAll(async () => {
    t = await createTestApp();
    await loadCatalogue(t.prisma);
    ids = await catalogueIds(t.prisma);
  });

  afterAll(async () => {
    await restoreSharedFixtures(t, ids);
    await t.close();
  });

  describe("happy path, one per product", () => {
    it("creates a hotel booking, holds the room night and lets the guest read it back", async () => {
      const date = isoDay(30);
      await setRoomFree(t, ids.flexPyramidRate.roomId, date, PLENTY);
      const quote = await createQuote(t, hotelQuoteBody(ids.flexPyramidRate.id, { checkIn: date, checkOut: isoDay(31) }));
      const before = await t.prisma.roomInventory.findUniqueOrThrow({
        where: { roomId_date: { roomId: ids.flexPyramidRate.roomId, date: new Date(`${date}T00:00:00Z`) } },
      });

      const person = customer();
      const res = await api(t)
        .post(BOOKINGS)
        .set("Idempotency-Key", newIdempotencyKey())
        .send(bookingBody(quote.id, { customer: person }))
        .expect(201);

      expect(res.body.reference).toMatch(BOOKING_REFERENCE_PATTERN);
      expect(res.body.status).toBe("PENDING_PAYMENT");
      expect(res.body.paymentStatus).toBe("UNPAID");
      expect(res.body.totals.total).toBe(quote.totals.total);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toMatchObject({ productType: "HOTEL", quantity: 1, status: "HELD" });

      const after = await t.prisma.roomInventory.findUniqueOrThrow({
        where: { roomId_date: { roomId: ids.flexPyramidRate.roomId, date: new Date(`${date}T00:00:00Z`) } },
      });
      expect(after.heldUnits).toBe(before.heldUnits + 1);

      const consumedQuote = await t.prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
      expect(consumedQuote.consumedAt).not.toBeNull();

      const events = await t.prisma.auditEvent.findMany({ where: { aggregateId: res.body.id }, orderBy: { id: "asc" } });
      expect(events.map((e) => e.action)).toEqual(["booking.created"]);
      const inventoryEvent = await t.prisma.auditEvent.findFirst({ where: { action: "inventory.held", aggregateType: "BookingItem" } });
      expect(inventoryEvent).not.toBeNull();
      const quoteEvent = await t.prisma.auditEvent.findFirst({ where: { action: "quote.consumed", aggregateId: quote.id } });
      expect(quoteEvent).not.toBeNull();

      // A guest with no email gets 404, not a hint that the booking exists.
      expectProblem(await api(t).get(`${BOOKINGS}/${res.body.id}`), 404, "NOT_FOUND");
      const read = await api(t).get(`${BOOKINGS}/${res.body.id}`).query({ email: person.email }).expect(200);
      expect(read.body.reference).toBe(res.body.reference);
      const readByReference = await api(t).get(`${BOOKINGS}/${res.body.reference}`).query({ email: person.email }).expect(200);
      expect(readByReference.body.id).toBe(res.body.id);
    });

    it("creates a tour booking and holds the session seats", async () => {
      await setTourFree(t, ids.pyramidsSession.id, PLENTY);
      const quote = await createQuote(t, tourQuoteBody(ids.pyramidsSession.id));
      const before = await t.prisma.tourSession.findUniqueOrThrow({ where: { id: ids.pyramidsSession.id } });
      const res = await api(t).post(BOOKINGS).set("Idempotency-Key", newIdempotencyKey()).send(bookingBody(quote.id)).expect(201);
      expect(res.body.items[0]).toMatchObject({ productType: "TOUR", quantity: 1 });
      const after = await t.prisma.tourSession.findUniqueOrThrow({ where: { id: ids.pyramidsSession.id } });
      expect(after.heldUnits).toBe(before.heldUnits + 1);
    });

    it("creates a car booking and holds each rental day", async () => {
      // Car inventory is seeded for a 30-day rolling window, so these dates must stay inside it.
      await setCarFree(t, ids.corollaCar.id, ids.caiAirport.id, isoDay(20), PLENTY);
      await setCarFree(t, ids.corollaCar.id, ids.caiAirport.id, isoDay(21), PLENTY);
      const quote = await createQuote(t, carQuoteBody(ids.corollaCar.id, ids.caiAirport.id, { pickupDate: isoDay(20), dropoffDate: isoDay(22) }));
      const res = await api(t).post(BOOKINGS).set("Idempotency-Key", newIdempotencyKey()).send(bookingBody(quote.id)).expect(201);
      expect(res.body.items[0]).toMatchObject({ productType: "CAR", quantity: 1 });
      for (const date of [isoDay(20), isoDay(21)]) {
        const row = await t.prisma.carInventory.findUniqueOrThrow({
          where: { carModelId_locationId_date: { carModelId: ids.corollaCar.id, locationId: ids.caiAirport.id, date: new Date(`${date}T00:00:00Z`) } },
        });
        expect(row.heldUnits).toBeGreaterThanOrEqual(1);
      }
    });

    it("creates a transfer booking and holds the vehicle on its date", async () => {
      // Transfer capacity is also a 30-day rolling window.
      const date = isoDay(24);
      await setTransferFree(t, ids.sedanRoute.vehicleClassId, date, PLENTY);
      const quote = await createQuote(t, transferQuoteBody(ids.sedanRoute.id, { date }));
      const res = await api(t).post(BOOKINGS).set("Idempotency-Key", newIdempotencyKey()).send(bookingBody(quote.id)).expect(201);
      expect(res.body.items[0]).toMatchObject({ productType: "TRANSFER", quantity: 1 });
      const row = await t.prisma.transferCapacity.findUniqueOrThrow({
        where: { vehicleClassId_date: { vehicleClassId: ids.sedanRoute.vehicleClassId, date: new Date(`${date}T00:00:00Z`) } },
      });
      expect(row.heldUnits).toBeGreaterThanOrEqual(1);
    });

    it("creates a package booking and holds the departure allotment, without reserving its components", async () => {
      await setDepartureFree(t, ids.cairoWeekendDeparture.id, PLENTY);
      const before = await t.prisma.packageDeparture.findUniqueOrThrow({ where: { id: ids.cairoWeekendDeparture.id } });
      // The Cairo Weekend package includes the Marriott, but V1 package inventory never touches it.
      const roomDate = new Date(`${before.startsOn.toISOString().slice(0, 10)}T00:00:00Z`);
      const roomBefore = await t.prisma.roomInventory.findUnique({ where: { roomId_date: { roomId: ids.flexPyramidRate.roomId, date: roomDate } } });

      const quote = await createQuote(t, packageQuoteBody(ids.cairoWeekendDeparture.id, { adults: 2 }));
      const res = await api(t).post(BOOKINGS).set("Idempotency-Key", newIdempotencyKey()).send(bookingBody(quote.id)).expect(201);
      expect(res.body.items[0]).toMatchObject({ productType: "PACKAGE", quantity: 2 });

      const after = await t.prisma.packageDeparture.findUniqueOrThrow({ where: { id: ids.cairoWeekendDeparture.id } });
      expect(after.heldTravellers).toBe(before.heldTravellers + 2);

      const roomAfter = await t.prisma.roomInventory.findUnique({ where: { roomId_date: { roomId: ids.flexPyramidRate.roomId, date: roomDate } } });
      expect(roomAfter?.heldUnits ?? 0).toBe(roomBefore?.heldUnits ?? 0);
    });
  });

  describe("ownership", () => {
    it("lets the signed-in owner read their booking without an email, and refuses other users", async () => {
      const owner = await createUser(t.prisma, "owner");
      const other = await createUser(t.prisma, "other");
      const ownerToken = await signIn(t, owner);
      const otherToken = await signIn(t, other);
      const quote = await freshHotelQuote(t, ids, isoDay(36), isoDay(37), ownerToken);
      const created = await api(t)
        .post(BOOKINGS)
        .set("Idempotency-Key", newIdempotencyKey())
        .set("Authorization", `Bearer ${ownerToken}`)
        .send(bookingBody(quote.id))
        .expect(201);

      await api(t).get(`${BOOKINGS}/${created.body.id}`).set("Authorization", `Bearer ${ownerToken}`).expect(200);
      expectProblem(await api(t).get(`${BOOKINGS}/${created.body.id}`).set("Authorization", `Bearer ${otherToken}`), 404, "NOT_FOUND");
      expectProblem(await api(t).get(`${BOOKINGS}/${created.body.id}`), 404, "NOT_FOUND");
    });

    it("lets a guest cancel with the right email, and holds inventory is released", async () => {
      const date = isoDay(38);
      const quote = await freshHotelQuote(t, ids, date, isoDay(39));
      const person = customer();
      const created = await api(t).post(BOOKINGS).set("Idempotency-Key", newIdempotencyKey()).send(bookingBody(quote.id, { customer: person })).expect(201);
      const held = await t.prisma.roomInventory.findUniqueOrThrow({
        where: { roomId_date: { roomId: ids.flexPyramidRate.roomId, date: new Date(`${date}T00:00:00Z`) } },
      });

      expectProblem(await api(t).post(`${BOOKINGS}/${created.body.id}/cancel`).send({ email: "wrong@example.test" }), 404, "NOT_FOUND");
      const cancelled = await api(t).post(`${BOOKINGS}/${created.body.id}/cancel`).send({ email: person.email, reason: "change of plans" }).expect(201);
      expect(cancelled.body.status).toBe("CANCELLED");
      expect(cancelled.body.items[0].status).toBe("CANCELLED");

      const released = await t.prisma.roomInventory.findUniqueOrThrow({
        where: { roomId_date: { roomId: ids.flexPyramidRate.roomId, date: new Date(`${date}T00:00:00Z`) } },
      });
      expect(released.heldUnits).toBe(held.heldUnits - 1);

      // Already cancelled: cancelling again is refused, and nothing is released a second time.
      const second = await api(t).post(`${BOOKINGS}/${created.body.id}/cancel`).send({ email: person.email });
      expect(second.status).toBe(409);
      expect(second.body.code).toBe("BOOKING_NOT_CANCELLABLE");
      const stillReleased = await t.prisma.roomInventory.findUniqueOrThrow({
        where: { roomId_date: { roomId: ids.flexPyramidRate.roomId, date: new Date(`${date}T00:00:00Z`) } },
      });
      expect(stillReleased.heldUnits).toBe(released.heldUnits);
    });
  });

  describe("idempotency", () => {
    it("requires an Idempotency-Key", async () => {
      const quote = await freshHotelQuote(t, ids, isoDay(40), isoDay(41));
      const res = await api(t).post(BOOKINGS).send(bookingBody(quote.id));
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    });

    it("replays the same result for the same key and the same request", async () => {
      const quote = await freshHotelQuote(t, ids, isoDay(42), isoDay(43));
      const body = bookingBody(quote.id);
      const key = newIdempotencyKey();
      const first = await api(t).post(BOOKINGS).set("Idempotency-Key", key).send(body).expect(201);
      const second = await api(t).post(BOOKINGS).set("Idempotency-Key", key).send(body).expect(201);
      expect(second.body.id).toBe(first.body.id);
      expect(second.body).toEqual(first.body);

      const bookingCount = await t.prisma.booking.count({ where: { quoteId: quote.id } });
      expect(bookingCount).toBe(1);
    });

    it("refuses the same key reused for a materially different request", async () => {
      const quoteA = await freshHotelQuote(t, ids, isoDay(44), isoDay(45));
      const quoteB = await freshHotelQuote(t, ids, isoDay(46), isoDay(47));
      const key = newIdempotencyKey();
      await api(t).post(BOOKINGS).set("Idempotency-Key", key).send(bookingBody(quoteA.id)).expect(201);
      const conflict = await api(t).post(BOOKINGS).set("Idempotency-Key", key).send(bookingBody(quoteB.id));
      expect(conflict.status).toBe(409);
      expect(conflict.body.code).toBe("IDEMPOTENCY_KEY_CONFLICT");
    });
  });

  describe("quote validity", () => {
    it("refuses a second booking attempt against an already-consumed quote", async () => {
      const quote = await freshHotelQuote(t, ids, isoDay(48), isoDay(49));
      await api(t).post(BOOKINGS).set("Idempotency-Key", newIdempotencyKey()).send(bookingBody(quote.id)).expect(201);
      const again = await api(t).post(BOOKINGS).set("Idempotency-Key", newIdempotencyKey()).send(bookingBody(quote.id));
      expect(again.status).toBe(409);
      expect(again.body.code).toBe("QUOTE_ALREADY_CONSUMED");
    });

    it("refuses an expired quote", async () => {
      const clock = t.app.get(Clock);
      const quote = await freshHotelQuote(t, ids, isoDay(50), isoDay(51));
      try {
        clock.advance(16 * 60_000); // the quote TTL is 15 minutes
        const res = await api(t).post(BOOKINGS).set("Idempotency-Key", newIdempotencyKey()).send(bookingBody(quote.id));
        expect(res.status).toBe(410);
        expect(res.body.code).toBe("QUOTE_EXPIRED");
      } finally {
        clock.reset();
      }
    });

    it("refuses an unknown quote id", async () => {
      const res = await api(t)
        .post(BOOKINGS)
        .set("Idempotency-Key", newIdempotencyKey())
        .send(bookingBody("00000000-0000-4000-8000-000000000000"));
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    });
  });
});
