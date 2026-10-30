import { TestApp } from "../support/app";
import { loadCatalogue } from "../catalogue/support";
import { BookingTransactionHooks, BookingTransactionStep } from "../../src/bookings/failure-injection";
import { api, BOOKINGS, bookingBody, catalogueIds, createQuote, createTestAppWithHook, hotelQuoteBody, isoDay, newIdempotencyKey, setRoomFree } from "./support";

/** Throws right after the named transaction checkpoint, forcing a rollback from that point on.
 *  Only ever constructed inside a test's own TestingModuleBuilder (see createTestAppWithHook);
 *  there is no path from production configuration to this class. */
class ThrowAtStep extends BookingTransactionHooks {
  constructor(private readonly step: BookingTransactionStep) {
    super();
  }

  after(step: BookingTransactionStep): Promise<void> {
    if (step === this.step) return Promise.reject(new Error(`injected failure at ${step}`));
    return Promise.resolve();
  }
}

/** Asserts the five guarantees item 12 requires, after a deliberately failed attempt. */
async function expectNoTrace(t: TestApp, quoteId: string, roomId: string, nightDates: string[]) {
  const quote = await t.prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
  expect(quote.consumedAt).toBeNull(); // no consumed quote without a booking
  expect(await t.prisma.booking.count({ where: { quoteId } })).toBe(0); // no orphan booking
  for (const date of nightDates) {
    const row = await t.prisma.roomInventory.findUniqueOrThrow({ where: { roomId_date: { roomId, date: new Date(`${date}T00:00:00Z`) } } });
    expect(row.heldUnits).toBe(0); // no leaked hold, and no partial stay (every night, not just the first)
  }
  const events = await t.prisma.auditEvent.count({ where: { aggregateType: "Quote", aggregateId: quoteId } });
  expect(events).toBe(0); // no misleading committed audit event
}

describe("Failure injection: the booking transaction rolls back completely (integration)", () => {
  async function run(step: BookingTransactionStep, nights: number): Promise<void> {
    const t = await createTestAppWithHook(new ThrowAtStep(step));
    try {
      await loadCatalogue(t.prisma);
      const ids = await catalogueIds(t.prisma);
      const roomId = ids.flexPyramidRate.roomId;
      const checkIn = isoDay(40);
      const nightDates = Array.from({ length: nights }, (_, i) => isoDay(40 + i));
      for (const date of nightDates) await setRoomFree(t, roomId, date, 5);
      const checkOut = isoDay(40 + nights);

      const quote = await createQuote(t, hotelQuoteBody(ids.flexPyramidRate.id, { checkIn, checkOut }));
      const res = await api(t).post(BOOKINGS).set("Idempotency-Key", newIdempotencyKey()).send(bookingBody(quote.id));
      expect(res.status).toBe(500);

      await expectNoTrace(t, quote.id, roomId, nightDates);
    } finally {
      await t.close();
    }
  }

  it("rolls back a failure right after the quote is consumed", async () => {
    await run("quote_consumed", 1);
  });

  it("rolls back a failure after the first of several nights is held", async () => {
    await run("first_inventory_mutation", 3);
  });

  it("rolls back a failure right after the booking row is created", async () => {
    await run("booking_created", 1);
  });

  it("rolls back a failure right after the booking item row is created", async () => {
    await run("booking_item_created", 1);
  });

  it("rolls back a failure after every night is held, before the audit trail completes", async () => {
    await run("inventory_held", 3);
  });
});
