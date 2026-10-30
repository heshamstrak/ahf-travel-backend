import { createTestApp, TestApp } from "../support/app";
import { loadCatalogue } from "../catalogue/support";
import { api, BOOKINGS, bookingBody, catalogueIds, createQuote, hotelQuoteBody, isoDay, newIdempotencyKey, setRoomFree } from "./support";

/**
 * A quote only proves availability at the instant it was priced (Milestone 3). Between that moment
 * and the booking attempt, someone else can take the last room on one of the nights. The booking
 * transaction's own guarded holds are what catch this, not the quote.
 */
describe("Multi-night hotel rollback (integration)", () => {
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

  it("fails the whole stay when a later night has no room left, and leaves the earlier nights untouched", async () => {
    const roomId = ids.flexPyramidRate.roomId;
    const night1 = isoDay(26);
    const night2 = isoDay(27);
    const night3 = isoDay(28);
    const checkOut = isoDay(29);

    await setRoomFree(t, roomId, night1, 5);
    await setRoomFree(t, roomId, night2, 5);
    await setRoomFree(t, roomId, night3, 5);

    // Valid at the moment of quoting: every night has rooms free.
    const quote = await createQuote(t, hotelQuoteBody(ids.flexPyramidRate.id, { checkIn: night1, checkOut }));

    // Someone else takes the last room on night 3 before the booking is attempted.
    await setRoomFree(t, roomId, night3, 0);

    const res = await api(t).post(BOOKINGS).set("Idempotency-Key", newIdempotencyKey()).send(bookingBody(quote.id));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("NOT_AVAILABLE");

    // Nights are held in ascending date order, so nights 1 and 2 would have succeeded on their own.
    // Because everything is one transaction, the whole attempt rolled back: no partial stay is held.
    for (const night of [night1, night2]) {
      const row = await t.prisma.roomInventory.findUniqueOrThrow({ where: { roomId_date: { roomId, date: new Date(`${night}T00:00:00Z`) } } });
      expect(row.heldUnits).toBe(0);
    }
    const night3Row = await t.prisma.roomInventory.findUniqueOrThrow({ where: { roomId_date: { roomId, date: new Date(`${night3}T00:00:00Z`) } } });
    expect(night3Row.heldUnits).toBe(0); // still 0: the failed attempt never added to it either

    // Quote consumption is part of the same transaction, so it rolled back too: the quote is still usable.
    const quoteRow = await t.prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(quoteRow.consumedAt).toBeNull();
    expect(await t.prisma.booking.count({ where: { quoteId: quote.id } })).toBe(0);
  });

  it("succeeds once availability is restored, using the same still-valid quote", async () => {
    const roomId = ids.flexPyramidRate.roomId;
    const night1 = isoDay(26);
    const night2 = isoDay(27);
    const night3 = isoDay(28);
    const checkOut = isoDay(29);

    await setRoomFree(t, roomId, night1, 5);
    await setRoomFree(t, roomId, night2, 5);
    await setRoomFree(t, roomId, night3, 5);
    const quote = await createQuote(t, hotelQuoteBody(ids.flexPyramidRate.id, { checkIn: night1, checkOut }));
    await setRoomFree(t, roomId, night3, 0);
    await api(t).post(BOOKINGS).set("Idempotency-Key", newIdempotencyKey()).send(bookingBody(quote.id)).expect(409);

    // Availability returns before the quote expires.
    await setRoomFree(t, roomId, night3, 5);
    const res = await api(t).post(BOOKINGS).set("Idempotency-Key", newIdempotencyKey()).send(bookingBody(quote.id)).expect(201);
    expect(res.body.items[0]).toMatchObject({ productType: "HOTEL", quantity: 1 });

    for (const night of [night1, night2, night3]) {
      const row = await t.prisma.roomInventory.findUniqueOrThrow({ where: { roomId_date: { roomId, date: new Date(`${night}T00:00:00Z`) } } });
      expect(row.heldUnits).toBe(1);
    }
  });
});
