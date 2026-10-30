import { createTestApp, TestApp } from "../support/app";
import { loadCatalogue } from "../catalogue/support";
import {
  ADMIN_PAYMENTS,
  api,
  BOOKINGS,
  catalogueIds,
  createAdmin,
  createPendingBooking,
  createUser,
  newIdempotencyKey,
  restoreSharedFixtures,
  selectCash,
  setTourFree,
  signIn,
  submitInstapay,
  tourQuoteBody,
  validPngBuffer,
} from "./support";

describe("Admin payment review (integration)", () => {
  let t: TestApp;
  let ids: Awaited<ReturnType<typeof catalogueIds>>;
  let adminToken: string;
  let customerToken: string;

  beforeAll(async () => {
    t = await createTestApp();
    await loadCatalogue(t.prisma);
    ids = await catalogueIds(t.prisma);
    const admin = await createAdmin(t, "reviewer");
    adminToken = await signIn(t, admin);
    const customer = await createUser(t.prisma, "plain-customer");
    customerToken = await signIn(t, customer);
  });

  afterAll(async () => {
    await restoreSharedFixtures(t, ids);
    await t.close();
  });

  async function submittedBooking(ref: string) {
    await setTourFree(t, ids.nileSession.id, 5);
    const booking = await createPendingBooking(t, tourQuoteBody(ids.nileSession.id));
    const submission = await submitInstapay(t, booking.id, { transferReference: ref, email: booking.customer.email }, validPngBuffer(), "receipt.png", newIdempotencyKey()).expect(201);
    return { booking, paymentId: submission.body.id as string };
  }

  it("rejects access from an unauthenticated caller and from a non-admin customer", async () => {
    const { paymentId } = await submittedBooking("ADM-001");
    await api(t).get(`${ADMIN_PAYMENTS}/instapay`).expect(401);
    const forbidden = await api(t).get(`${ADMIN_PAYMENTS}/instapay`).set("Authorization", `Bearer ${customerToken}`);
    expect(forbidden.status).toBe(403);
    await api(t).post(`${ADMIN_PAYMENTS}/${paymentId}/approve`).set("Authorization", `Bearer ${customerToken}`).expect(403);
  });

  it("lists pending InstaPay submissions and returns a detail view with proof metadata", async () => {
    const { paymentId, booking } = await submittedBooking("ADM-002");

    // The queue is sorted oldest-first (FIFO review order), and other spec files in the same run
    // accumulate their own PENDING_VERIFICATION rows, so a freshly submitted one may be several
    // pages in. Page through, the way a real reviewer's dashboard would, instead of assuming page 1.
    let found = false;
    for (let page = 1; page <= 20 && !found; page++) {
      const list = await api(t)
        .get(`${ADMIN_PAYMENTS}/instapay`)
        .query({ status: "PENDING_VERIFICATION", page, pageSize: 50 })
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      found = (list.body.items as { id: string }[]).some((p) => p.id === paymentId);
      if (list.body.items.length === 0) break;
    }
    expect(found).toBe(true);

    const detail = await api(t).get(`${ADMIN_PAYMENTS}/${paymentId}`).set("Authorization", `Bearer ${adminToken}`).expect(200);
    expect(detail.body.proof).toMatchObject({ mimeType: "image/png" });
    expect(detail.body.booking).toMatchObject({ id: booking.id, status: "PENDING_PAYMENT" });
  });

  it("approves a submission: payment SUCCEEDED, booking CONFIRMED, inventory sold", async () => {
    const { paymentId, booking } = await submittedBooking("ADM-003");
    const res = await api(t).post(`${ADMIN_PAYMENTS}/${paymentId}/approve`).set("Authorization", `Bearer ${adminToken}`).expect(201);
    expect(res.body.status).toBe("SUCCEEDED");

    const bookingRow = await api(t).get(`${BOOKINGS}/${booking.id}`).query({ email: booking.customer.email }).expect(200);
    expect(bookingRow.body.status).toBe("CONFIRMED");
    expect(bookingRow.body.paymentStatus).toBe("PAID");
    expect(bookingRow.body.items[0].status).toBe("CONFIRMED");

    const payment = await t.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.reviewedById).toBeTruthy();
    expect(payment.succeededAt).not.toBeNull();
  });

  it("rejects an approval repeated after it already succeeded", async () => {
    const { paymentId } = await submittedBooking("ADM-004");
    await api(t).post(`${ADMIN_PAYMENTS}/${paymentId}/approve`).set("Authorization", `Bearer ${adminToken}`).expect(201);
    const res = await api(t).post(`${ADMIN_PAYMENTS}/${paymentId}/approve`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PAYMENT_NOT_REVIEWABLE");
  });

  it("rejects a submission with a reason, leaves the booking PENDING_PAYMENT and the hold intact, and allows a new submission", async () => {
    const { paymentId, booking } = await submittedBooking("ADM-005");
    const rejected = await api(t)
      .post(`${ADMIN_PAYMENTS}/${paymentId}/reject`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "Reference does not match our records" })
      .expect(201);
    expect(rejected.body.status).toBe("REJECTED");
    expect(rejected.body.rejectionReason).toBe("Reference does not match our records");

    const bookingRow = await api(t).get(`${BOOKINGS}/${booking.id}`).query({ email: booking.customer.email }).expect(200);
    expect(bookingRow.body.status).toBe("PENDING_PAYMENT");

    const session = await t.prisma.tourSession.findUniqueOrThrow({ where: { id: ids.nileSession.id } });
    expect(session.heldUnits).toBeGreaterThanOrEqual(1); // still held: the hold was never touched

    // A fresh proof can still be submitted while the hold lasts, and this one can be approved.
    const resubmit = await submitInstapay(t, booking.id, { transferReference: "ADM-005-RETRY", email: booking.customer.email }, validPngBuffer(), "receipt2.png", newIdempotencyKey()).expect(201);
    expect(resubmit.body.id).not.toBe(paymentId);
    await api(t).post(`${ADMIN_PAYMENTS}/${resubmit.body.id}/approve`).set("Authorization", `Bearer ${adminToken}`).expect(201);
    const confirmed = await api(t).get(`${BOOKINGS}/${booking.id}`).query({ email: booking.customer.email }).expect(200);
    expect(confirmed.body.status).toBe("CONFIRMED");

    // The rejected attempt is kept on record, not overwritten.
    const rejectedRow = await t.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(rejectedRow.status).toBe("REJECTED");
  });

  it("rejects a rejection without a reason", async () => {
    const { paymentId } = await submittedBooking("ADM-006");
    const res = await api(t).post(`${ADMIN_PAYMENTS}/${paymentId}/reject`).set("Authorization", `Bearer ${adminToken}`).send({});
    expect(res.status).toBe(422);
  });

  it("records a cash payment as collected, moving the booking's paymentStatus to PAID, and is safe to repeat", async () => {
    await setTourFree(t, ids.nileSession.id, 5);
    const booking = await createPendingBooking(t, tourQuoteBody(ids.nileSession.id));
    await selectCash(t, booking.id, { email: booking.customer.email }).expect(201);
    const payment = await t.prisma.payment.findFirstOrThrow({ where: { bookingId: booking.id } });

    const collected = await api(t).post(`${ADMIN_PAYMENTS}/${payment.id}/cash-collected`).set("Authorization", `Bearer ${adminToken}`).expect(201);
    expect(collected.body.status).toBe("SUCCEEDED");

    const bookingRow = await api(t).get(`${BOOKINGS}/${booking.id}`).query({ email: booking.customer.email }).expect(200);
    expect(bookingRow.body.paymentStatus).toBe("PAID");

    const repeat = await api(t).post(`${ADMIN_PAYMENTS}/${payment.id}/cash-collected`).set("Authorization", `Bearer ${adminToken}`);
    expect(repeat.status).toBe(409);
    expect(repeat.body.code).toBe("PAYMENT_NOT_COLLECTIBLE");
  });
});
