import { createTestApp, TestApp } from "../support/app";
import { loadCatalogue } from "../catalogue/support";
import { catalogueIds, createPendingBooking, hotelQuoteBody, isoDay, selectCash, setRoomFree } from "./support";

/**
 * Mirrors bookings/multi-night-rollback.e2e-spec.ts, but for confirmation (held -> sold) instead of
 * holding. In normal operation a booking's own held units can never fall short during its own
 * confirmation (see inventory-confirm.ts's header comment) — this corrupts one night's counters
 * directly, the same technique the M4 test uses to simulate "something is inconsistent", to prove
 * the conversion is still all-or-nothing rather than assumed safe.
 */
describe("Multi-night hotel confirmation rollback (integration)", () => {
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

  it("fails the whole confirmation when a later night's hold was corrupted, and leaves every night untouched", async () => {
    const roomId = ids.flexPyramidRate.roomId;
    const night1 = isoDay(40);
    const night2 = isoDay(41);
    const night3 = isoDay(42);
    const checkOut = isoDay(43);

    for (const night of [night1, night2, night3]) await setRoomFree(t, roomId, night, 5);
    const booking = await createPendingBooking(t, hotelQuoteBody(ids.flexPyramidRate.id, { checkIn: night1, checkOut }));

    // Confirm every night actually got held.
    for (const night of [night1, night2, night3]) {
      const row = await t.prisma.roomInventory.findUniqueOrThrow({ where: { roomId_date: { roomId, date: new Date(`${night}T00:00:00Z`) } } });
      expect(row.heldUnits).toBe(1);
    }

    // Simulate an inconsistency on the last night only: its hold has vanished without the booking
    // knowing. This can't happen through the API; it stands in for "something went wrong" so the
    // all-or-nothing guarantee can be observed directly.
    await t.prisma.roomInventory.update({
      where: { roomId_date: { roomId, date: new Date(`${night3}T00:00:00Z`) } },
      data: { heldUnits: 0 },
    });

    const res = await selectCash(t, booking.id, { email: booking.customer.email });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("NOT_AVAILABLE");

    // Nights 1 and 2 would have converted on their own (ascending order); because everything is one
    // transaction, that partial progress rolled back too.
    for (const night of [night1, night2]) {
      const row = await t.prisma.roomInventory.findUniqueOrThrow({ where: { roomId_date: { roomId, date: new Date(`${night}T00:00:00Z`) } } });
      expect(row.heldUnits).toBe(1);
      expect(row.soldUnits).toBe(0);
    }
    const night3Row = await t.prisma.roomInventory.findUniqueOrThrow({ where: { roomId_date: { roomId, date: new Date(`${night3}T00:00:00Z`) } } });
    expect(night3Row.heldUnits).toBe(0); // the corruption itself, untouched by the rolled-back attempt
    expect(night3Row.soldUnits).toBe(0);

    // The booking itself was never confirmed, and no Payment row was left behind.
    const bookingRow = await t.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(bookingRow.status).toBe("PENDING_PAYMENT");
    expect(await t.prisma.payment.count({ where: { bookingId: booking.id } })).toBe(0);
    const item = await t.prisma.bookingItem.findFirstOrThrow({ where: { bookingId: booking.id } });
    expect(item.status).toBe("HELD");
  });
});
