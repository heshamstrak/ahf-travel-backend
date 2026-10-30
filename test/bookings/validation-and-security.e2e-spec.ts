import { createTestApp, TestApp } from "../support/app";
import { loadCatalogue } from "../catalogue/support";
import {
  api,
  BOOKINGS,
  bookingBody,
  catalogueIds,
  createQuote,
  customer,
  hotelQuoteBody,
  isoDay,
  newIdempotencyKey,
  setRoomFree,
} from "./support";

const INTERNAL_KEYS = [
  "hotelId",
  "roomId",
  "ratePlanId",
  "tourId",
  "tourSessionId",
  "carModelId",
  "pickupLocationId",
  "transferRateId",
  "packageDepartureId",
  "userId",
  "cancelledById",
  "guestTokenHash",
  "quoteId",
  "version",
];

describe("Booking request tampering and response secrecy (integration)", () => {
  let t: TestApp;
  let ids: Awaited<ReturnType<typeof catalogueIds>>;

  beforeAll(async () => {
    t = await createTestApp();
    await loadCatalogue(t.prisma);
    ids = await catalogueIds(t.prisma);
  });

  afterAll(async () => {
    await t.close();
  });

  async function freshQuote(offset: number) {
    await setRoomFree(t, ids.flexPyramidRate.roomId, isoDay(offset), 5);
    return createQuote(t, hotelQuoteBody(ids.flexPyramidRate.id, { checkIn: isoDay(offset), checkOut: isoDay(offset + 1) }));
  }

  it("refuses a client-supplied price, tax, fee, discount or alternate product id at the top level", async () => {
    const quote = await freshQuote(52);
    for (const extra of [
      { total: "1.00" },
      { subtotal: "1.00" },
      { tax: "0.00" },
      { fee: "0.00" },
      { discount: "999.00" },
      { productId: ids.flexPyramidRate.id },
      { inventoryCount: 1 },
      { status: "CONFIRMED" },
    ]) {
      const res = await api(t).post(BOOKINGS).set("Idempotency-Key", newIdempotencyKey()).send({ ...bookingBody(quote.id), ...extra });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("VALIDATION_FAILED");
    }
  });

  it("validates the customer's contact details", async () => {
    const quote = await freshQuote(53);
    const cases = [
      { firstName: "" },
      { email: "not-an-email" },
      { phone: "abc" },
      { countryCode: "eg" },
      { countryCode: "EGY" },
    ];
    for (const invalid of cases) {
      const res = await api(t)
        .post(BOOKINGS)
        .set("Idempotency-Key", newIdempotencyKey())
        .send(bookingBody(quote.id, { customer: customer(invalid) }));
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("VALIDATION_FAILED");
    }
  });

  it("rejects a special request that is unreasonably long", async () => {
    const quote = await freshQuote(54);
    const res = await api(t)
      .post(BOOKINGS)
      .set("Idempotency-Key", newIdempotencyKey())
      .send(bookingBody(quote.id, { specialRequests: "x".repeat(2001) }));
    expect(res.status).toBe(422);
  });

  it("never returns internal foreign-key ids, the owner id or a token hash", async () => {
    const quote = await freshQuote(55);
    const res = await api(t).post(BOOKINGS).set("Idempotency-Key", newIdempotencyKey()).send(bookingBody(quote.id)).expect(201);
    const json = JSON.stringify(res.body);
    for (const key of INTERNAL_KEYS) {
      expect(json).not.toContain(`"${key}"`);
    }
    // The public catalogue ids inside product snapshots (hotel.id, room.id, ...) are fine: the
    // catalogue endpoints already expose them. Only the raw BookingItem foreign-key columns, and
    // the booking's own internal bookkeeping columns, are withheld.
    expect(res.body.items[0].product).toBeDefined();
  });

  it("rejects a cancellation reason that is too long", async () => {
    const quote = await freshQuote(56);
    const person = customer();
    const created = await api(t).post(BOOKINGS).set("Idempotency-Key", newIdempotencyKey()).send(bookingBody(quote.id, { customer: person })).expect(201);
    const res = await api(t)
      .post(`${BOOKINGS}/${created.body.id}/cancel`)
      .send({ email: person.email, reason: "y".repeat(256) });
    expect(res.status).toBe(422);
  });
});
