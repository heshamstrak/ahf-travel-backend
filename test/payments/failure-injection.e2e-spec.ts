import { TestApp } from "../support/app";
import { loadCatalogue } from "../catalogue/support";
import { PaymentTransactionHooks, PaymentTransactionStep } from "../../src/payments/failure-injection";
import {
  catalogueIds,
  createPendingBooking,
  createTestAppWithPaymentHook,
  hotelQuoteBody,
  isoDay,
  newIdempotencyKey,
  restoreSharedFixtures,
  selectCash,
  setRoomFree,
  setTourFree,
  submitInstapay,
  tourQuoteBody,
  validPngBuffer,
} from "./support";

/** Throws right after the named checkpoint, the same technique as bookings/failure-injection.e2e-spec.ts. */
class ThrowAtStep extends PaymentTransactionHooks {
  constructor(private readonly step: PaymentTransactionStep) {
    super();
  }

  after(step: PaymentTransactionStep): Promise<void> {
    if (step === this.step) return Promise.reject(new Error(`injected failure at ${step}`));
    return Promise.resolve();
  }
}

describe("Failure injection: the payment/confirmation transaction rolls back completely (integration)", () => {
  async function expectNoConfirmationTrace(t: TestApp, bookingId: string) {
    const booking = await t.prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe("PENDING_PAYMENT");
    expect(booking.confirmedAt).toBeNull();
    expect(await t.prisma.payment.count({ where: { bookingId } })).toBe(0);
    const item = await t.prisma.bookingItem.findFirstOrThrow({ where: { bookingId } });
    expect(item.status).toBe("HELD");
  }

  async function runCash(step: PaymentTransactionStep, nights: number): Promise<void> {
    const t = await createTestAppWithPaymentHook(new ThrowAtStep(step));
    try {
      await loadCatalogue(t.prisma);
      const ids = await catalogueIds(t.prisma);
      const checkIn = isoDay(45);
      const nightDates = Array.from({ length: nights }, (_, i) => isoDay(45 + i));
      for (const date of nightDates) await setRoomFree(t, ids.flexPyramidRate.roomId, date, 5);
      const checkOut = isoDay(45 + nights);
      const booking = await createPendingBooking(t, hotelQuoteBody(ids.flexPyramidRate.id, { checkIn, checkOut }));

      const res = await selectCash(t, booking.id, { email: booking.customer.email });
      expect(res.status).toBe(500);

      await expectNoConfirmationTrace(t, booking.id);
      for (const date of nightDates) {
        const row = await t.prisma.roomInventory.findUniqueOrThrow({
          where: { roomId_date: { roomId: ids.flexPyramidRate.roomId, date: new Date(`${date}T00:00:00Z`) } },
        });
        expect(row.heldUnits).toBe(1); // still held, never converted, never double-converted
        expect(row.soldUnits).toBe(0);
      }
    } finally {
      await t.close();
    }
  }

  it("rolls back a failure right after the Payment row is created", async () => {
    await runCash("payment_created", 1);
  });

  it("rolls back a failure right after the booking is confirmed, before any inventory converts", async () => {
    await runCash("booking_confirmed", 1);
  });

  it("rolls back a failure after the first of several nights converts", async () => {
    await runCash("first_inventory_conversion", 3);
  });

  it("rolls back a failure after every night converts, before the audit trail completes", async () => {
    await runCash("inventory_converted", 3);
  });

  it("rolls back an InstaPay submission if it fails between the Payment row and the Media metadata row", async () => {
    const t = await createTestAppWithPaymentHook(new ThrowAtStep("proof_created"));
    try {
      await loadCatalogue(t.prisma);
      const ids = await catalogueIds(t.prisma);
      await setTourFree(t, ids.nileSession.id, 5);
      const booking = await createPendingBooking(t, tourQuoteBody(ids.nileSession.id));
      // Other spec files share this database and may already have created PAYMENT_PROOF media rows,
      // so the assertion below is "this attempt added none", not "the table is empty".
      const mediaBefore = await t.prisma.media.count({ where: { ownerType: "PAYMENT_PROOF" } });
      const key = newIdempotencyKey();

      const res = await submitInstapay(t, booking.id, { transferReference: "FAIL-1", email: booking.customer.email }, validPngBuffer(), "receipt.png", key);
      expect(res.status).toBe(500);

      expect(await t.prisma.payment.count({ where: { bookingId: booking.id } })).toBe(0);
      expect(await t.prisma.media.count({ where: { ownerType: "PAYMENT_PROOF" } })).toBe(mediaBefore);
      expect(await t.prisma.idempotencyKey.count({ where: { operation: "payment.instapay_submit", key } })).toBe(0);
      const bookingRow = await t.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(bookingRow.status).toBe("PENDING_PAYMENT");

      // This booking's hold on nileSession is never released within this test (nothing here
      // cancels, expires or confirms it), so put the shared fixture back before other suites read it.
      await restoreSharedFixtures(t, ids);
    } finally {
      await t.close();
    }
  });
});
