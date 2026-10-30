import { createTestApp, TestApp } from "../support/app";
import { loadCatalogue } from "../catalogue/support";
import { HoldExpirationService } from "../../src/bookings/hold-expiration.service";
import {
  ADMIN_PAYMENTS,
  api,
  BOOKINGS,
  catalogueIds,
  createAdmin,
  createPendingBooking,
  newIdempotencyKey,
  restoreSharedFixtures,
  selectCash,
  setTourFree,
  signIn,
  submitInstapay,
  tourQuoteBody,
  validPngBuffer,
} from "./support";

const PAST = new Date("2020-01-01T00:00:00Z");
/** Real races are not always won by the same side. Repeating catches a guard that only works "by luck". */
const REPEATS = 5;

interface Outcome {
  status: number;
  body: { code?: string; status?: string };
}

describe("Payment concurrency against real PostgreSQL (integration)", () => {
  let t: TestApp;
  let ids: Awaited<ReturnType<typeof catalogueIds>>;
  let worker: HoldExpirationService;
  let adminToken: string;

  beforeAll(async () => {
    t = await createTestApp();
    await loadCatalogue(t.prisma);
    ids = await catalogueIds(t.prisma);
    worker = t.app.get(HoldExpirationService);
    adminToken = await signIn(t, await createAdmin(t, "race-admin"));
  });

  afterAll(async () => {
    await restoreSharedFixtures(t, ids);
    await t.close();
  });

  it("two simultaneous CASH confirmations on the same booking: exactly one wins", async () => {
    for (let i = 0; i < REPEATS; i++) {
      await setTourFree(t, ids.nileSession.id, 5);
      const booking = await createPendingBooking(t, tourQuoteBody(ids.nileSession.id));
      const [a, b] = (await Promise.all([
        selectCash(t, booking.id, { email: booking.customer.email }),
        selectCash(t, booking.id, { email: booking.customer.email }),
      ])) as unknown as Outcome[];
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([201, 409]);

      expect(await t.prisma.payment.count({ where: { bookingId: booking.id } })).toBe(1);
      const session = await t.prisma.tourSession.findUniqueOrThrow({ where: { id: ids.nileSession.id } });
      expect(session.heldUnits).toBe(0);
    }
  });

  it("two simultaneous admin InstaPay approvals of the same payment: exactly one wins", async () => {
    for (let i = 0; i < REPEATS; i++) {
      await setTourFree(t, ids.nileSession.id, 5);
      const booking = await createPendingBooking(t, tourQuoteBody(ids.nileSession.id));
      const submission = await submitInstapay(t, booking.id, { transferReference: `RACE-${i}`, email: booking.customer.email }, validPngBuffer(), "r.png", newIdempotencyKey()).expect(201);

      const [a, b] = (await Promise.all([
        api(t).post(`${ADMIN_PAYMENTS}/${submission.body.id}/approve`).set("Authorization", `Bearer ${adminToken}`),
        api(t).post(`${ADMIN_PAYMENTS}/${submission.body.id}/approve`).set("Authorization", `Bearer ${adminToken}`),
      ])) as unknown as Outcome[];
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([201, 409]);

      const session = await t.prisma.tourSession.findUniqueOrThrow({ where: { id: ids.nileSession.id } });
      expect(session.heldUnits).toBe(0);
      expect(session.bookedUnits).toBeGreaterThanOrEqual(1);
    }
  });

  it("InstaPay approval racing hold expiration: never both confirmed and expired, never neither", async () => {
    for (let i = 0; i < REPEATS; i++) {
      await setTourFree(t, ids.nileSession.id, 5);
      const booking = await createPendingBooking(t, tourQuoteBody(ids.nileSession.id));
      const submission = await submitInstapay(t, booking.id, { transferReference: `RACE-EXP-${i}`, email: booking.customer.email }, validPngBuffer(), "r.png", newIdempotencyKey()).expect(201);
      await t.prisma.booking.update({ where: { id: booking.id }, data: { holdExpiresAt: PAST } });

      await Promise.all([api(t).post(`${ADMIN_PAYMENTS}/${submission.body.id}/approve`).set("Authorization", `Bearer ${adminToken}`), worker.run()]);

      const row = await t.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(["CONFIRMED", "EXPIRED"]).toContain(row.status);
      const session = await t.prisma.tourSession.findUniqueOrThrow({ where: { id: ids.nileSession.id } });
      expect(session.heldUnits).toBe(0); // never left held: either sold (confirmed) or released (expired)

      const payment = await t.prisma.payment.findUniqueOrThrow({ where: { id: submission.body.id } });
      if (row.status === "CONFIRMED") {
        expect(payment.status).toBe("SUCCEEDED");
        expect(session.bookedUnits).toBeGreaterThanOrEqual(1);
      } else {
        // The approval lost the race and must not have silently reacquired inventory for a released booking.
        expect(payment.status).toBe("PENDING_VERIFICATION");
      }
    }
  });

  it("CASH confirmation racing hold expiration: never both confirmed and expired, never neither", async () => {
    for (let i = 0; i < REPEATS; i++) {
      await setTourFree(t, ids.pyramidsSession.id, 5);
      const booking = await createPendingBooking(t, tourQuoteBody(ids.pyramidsSession.id));
      await t.prisma.booking.update({ where: { id: booking.id }, data: { holdExpiresAt: PAST } });

      await Promise.all([selectCash(t, booking.id, { email: booking.customer.email }), worker.run()]);

      const row = await t.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(["CONFIRMED", "EXPIRED"]).toContain(row.status);
      const session = await t.prisma.tourSession.findUniqueOrThrow({ where: { id: ids.pyramidsSession.id } });
      expect(session.heldUnits).toBe(0);
    }
  });

  it("cancellation racing CASH confirmation: never both cancelled and confirmed, inventory settles exactly once", async () => {
    for (let i = 0; i < REPEATS; i++) {
      await setTourFree(t, ids.pyramidsSession.id, 5);
      const booking = await createPendingBooking(t, tourQuoteBody(ids.pyramidsSession.id));

      await Promise.all([
        api(t).post(`${BOOKINGS}/${booking.id}/cancel`).send({ email: booking.customer.email }),
        selectCash(t, booking.id, { email: booking.customer.email }),
      ]);

      const row = await t.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(["CANCELLED", "CONFIRMED"]).toContain(row.status);
      const session = await t.prisma.tourSession.findUniqueOrThrow({ where: { id: ids.pyramidsSession.id } });
      expect(session.heldUnits).toBe(0);
    }
  });

  it("two simultaneous identical InstaPay submissions with the same idempotency key: exactly one Payment and one Media row", async () => {
    for (let i = 0; i < REPEATS; i++) {
      await setTourFree(t, ids.nileSession.id, 5);
      const booking = await createPendingBooking(t, tourQuoteBody(ids.nileSession.id));
      const key = newIdempotencyKey();
      const file = validPngBuffer();
      const [a, b] = (await Promise.all([
        submitInstapay(t, booking.id, { transferReference: `DUP-${i}`, email: booking.customer.email }, file, "r.png", key),
        submitInstapay(t, booking.id, { transferReference: `DUP-${i}`, email: booking.customer.email }, file, "r.png", key),
      ])) as unknown as Outcome[];
      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      expect(a.body as unknown as { id: string }).toEqual(b.body as unknown as { id: string });
      expect(await t.prisma.payment.count({ where: { bookingId: booking.id } })).toBe(1);
      expect(await t.prisma.idempotencyKey.count({ where: { operation: "payment.instapay_submit", key } })).toBe(1);
    }
  });

  it("two simultaneous admin cash-collected actions on the same payment: exactly one wins", async () => {
    for (let i = 0; i < REPEATS; i++) {
      await setTourFree(t, ids.nileSession.id, 5);
      const booking = await createPendingBooking(t, tourQuoteBody(ids.nileSession.id));
      await selectCash(t, booking.id, { email: booking.customer.email }).expect(201);
      const payment = await t.prisma.payment.findFirstOrThrow({ where: { bookingId: booking.id } });

      const [a, b] = (await Promise.all([
        api(t).post(`${ADMIN_PAYMENTS}/${payment.id}/cash-collected`).set("Authorization", `Bearer ${adminToken}`),
        api(t).post(`${ADMIN_PAYMENTS}/${payment.id}/cash-collected`).set("Authorization", `Bearer ${adminToken}`),
      ])) as unknown as Outcome[];
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([201, 409]);

      const updated = await t.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(updated.status).toBe("SUCCEEDED");
    }
  });
});
