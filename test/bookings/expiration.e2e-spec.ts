import { createTestApp, TestApp } from "../support/app";
import { loadCatalogue } from "../catalogue/support";
import { HoldExpirationService } from "../../src/bookings/hold-expiration.service";
import { api, BOOKINGS, bookingBody, catalogueIds, createQuote, hotelQuoteBody, isoDay, newIdempotencyKey, setRoomFree } from "./support";

const PAST = new Date("2020-01-01T00:00:00Z");

async function createPendingBooking(t: TestApp, ids: Awaited<ReturnType<typeof catalogueIds>>, checkIn: string, checkOut: string) {
  await setRoomFree(t, ids.flexPyramidRate.roomId, checkIn, 5);
  const quote = await createQuote(t, hotelQuoteBody(ids.flexPyramidRate.id, { checkIn, checkOut }));
  const res = await api(t).post(BOOKINGS).set("Idempotency-Key", newIdempotencyKey()).send(bookingBody(quote.id)).expect(201);
  return res.body as { id: string };
}

describe("Hold expiration and its races with cancellation (integration)", () => {
  let t: TestApp;
  let ids: Awaited<ReturnType<typeof catalogueIds>>;
  let worker: HoldExpirationService;

  beforeAll(async () => {
    t = await createTestApp();
    await loadCatalogue(t.prisma);
    ids = await catalogueIds(t.prisma);
    worker = t.app.get(HoldExpirationService);
  });

  afterAll(async () => {
    await t.close();
  });

  it("releases a booking whose hold is overdue, and leaves one that is not due alone", async () => {
    const checkIn = isoDay(26);
    const checkOut = isoDay(27);
    const due = await createPendingBooking(t, ids, checkIn, checkOut);
    await t.prisma.booking.update({ where: { id: due.id }, data: { holdExpiresAt: PAST } });

    const notDueCheckIn = isoDay(28);
    const notDue = await createPendingBooking(t, ids, notDueCheckIn, isoDay(29));

    const result = await worker.run();
    expect(result.expired).toBeGreaterThanOrEqual(1);

    const dueRow = await t.prisma.booking.findUniqueOrThrow({ where: { id: due.id }, include: { items: true } });
    expect(dueRow.status).toBe("EXPIRED");
    expect(dueRow.items[0]!.status).toBe("EXPIRED");
    const dueInventory = await t.prisma.roomInventory.findUniqueOrThrow({
      where: { roomId_date: { roomId: ids.flexPyramidRate.roomId, date: new Date(`${checkIn}T00:00:00Z`) } },
    });
    expect(dueInventory.heldUnits).toBe(0);

    const notDueRow = await t.prisma.booking.findUniqueOrThrow({ where: { id: notDue.id } });
    expect(notDueRow.status).toBe("PENDING_PAYMENT");
    const notDueInventory = await t.prisma.roomInventory.findUniqueOrThrow({
      where: { roomId_date: { roomId: ids.flexPyramidRate.roomId, date: new Date(`${notDueCheckIn}T00:00:00Z`) } },
    });
    expect(notDueInventory.heldUnits).toBe(1);

    const events = await t.prisma.auditEvent.findMany({ where: { aggregateId: due.id }, orderBy: { id: "asc" } });
    expect(events.map((e) => e.action)).toEqual(expect.arrayContaining(["hold.expired", "inventory.released"]));

    // Running again is a safe no-op: nothing left to expire for this booking, and nothing changes.
    const again = await worker.run();
    const stillReleased = await t.prisma.roomInventory.findUniqueOrThrow({
      where: { roomId_date: { roomId: ids.flexPyramidRate.roomId, date: new Date(`${checkIn}T00:00:00Z`) } },
    });
    expect(stillReleased.heldUnits).toBe(0);
    void again;
  });

  it("releases inventory exactly once when two expiration workers race on the same hold", async () => {
    const checkIn = isoDay(30);
    const checkOut = isoDay(31);
    const booking = await createPendingBooking(t, ids, checkIn, checkOut);
    await t.prisma.booking.update({ where: { id: booking.id }, data: { holdExpiresAt: PAST } });

    const [a, b] = await Promise.all([worker.run(), worker.run()]);
    // Exactly one of the two invocations actually performed the release; the other found nothing to do.
    expect(a.expired + b.expired).toBe(1);

    const row = await t.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(row.status).toBe("EXPIRED");
    const inventory = await t.prisma.roomInventory.findUniqueOrThrow({
      where: { roomId_date: { roomId: ids.flexPyramidRate.roomId, date: new Date(`${checkIn}T00:00:00Z`) } },
    });
    expect(inventory.heldUnits).toBe(0); // released once, not driven negative by a double release
  });

  it("lets exactly one of a simultaneous cancellation and expiration own the release", async () => {
    const checkIn = isoDay(32);
    const checkOut = isoDay(33);
    const booking = await createPendingBooking(t, ids, checkIn, checkOut);
    await t.prisma.booking.update({ where: { id: booking.id }, data: { holdExpiresAt: PAST } });
    const customerEmail = (await t.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).customerEmail;

    await Promise.all([api(t).post(`${BOOKINGS}/${booking.id}/cancel`).send({ email: customerEmail }), worker.run()]);

    const row = await t.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(["CANCELLED", "EXPIRED"]).toContain(row.status);
    const inventory = await t.prisma.roomInventory.findUniqueOrThrow({
      where: { roomId_date: { roomId: ids.flexPyramidRate.roomId, date: new Date(`${checkIn}T00:00:00Z`) } },
    });
    // Released exactly once, whichever side won: never still held, never double-released.
    expect(inventory.heldUnits).toBe(0);
  });
});
