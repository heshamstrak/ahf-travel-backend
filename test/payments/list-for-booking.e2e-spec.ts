import { createTestApp, TestApp } from "../support/app";
import { loadCatalogue } from "../catalogue/support";
import {
  ADMIN_PAYMENTS,
  api,
  BOOKINGS,
  bookingBody,
  catalogueIds,
  createAdmin,
  createPendingBooking,
  createQuote,
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

describe("GET /bookings/:idOrReference/payments (integration)", () => {
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

  it("returns an empty list for a booking that has no payment attempts yet", async () => {
    await setTourFree(t, ids.nileSession.id, 5);
    const booking = await createPendingBooking(t, tourQuoteBody(ids.nileSession.id));
    const res = await api(t).get(`${BOOKINGS}/${booking.id}/payments`).query({ email: booking.customer.email }).expect(200);
    expect(res.body).toEqual([]);
  });

  it("shows a selected cash payment as PENDING (not yet collected)", async () => {
    await setTourFree(t, ids.nileSession.id, 5);
    const booking = await createPendingBooking(t, tourQuoteBody(ids.nileSession.id));
    await selectCash(t, booking.id, { email: booking.customer.email }).expect(201);
    const res = await api(t).get(`${BOOKINGS}/${booking.id}/payments`).query({ email: booking.customer.email }).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ method: "CASH", status: "PENDING" });
  });

  it("shows a submitted InstaPay proof as PENDING_VERIFICATION with no rejection reason", async () => {
    await setTourFree(t, ids.nileSession.id, 5);
    const booking = await createPendingBooking(t, tourQuoteBody(ids.nileSession.id));
    await submitInstapay(t, booking.id, { transferReference: "TRX-LIST-1", email: booking.customer.email }, validPngBuffer(), "receipt.png", newIdempotencyKey()).expect(201);
    const res = await api(t).get(`${BOOKINGS}/${booking.id}/payments`).query({ email: booking.customer.email }).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ method: "INSTAPAY", status: "PENDING_VERIFICATION", transferReference: "TRX-LIST-1", rejectionReason: null });
  });

  it("surfaces the admin's rejection reason once a submission is rejected, so the customer knows how to resubmit", async () => {
    await setTourFree(t, ids.nileSession.id, 5);
    const booking = await createPendingBooking(t, tourQuoteBody(ids.nileSession.id));
    const admin = await createAdmin(t, "list-payments-reviewer");
    const adminToken = await signIn(t, admin);
    const submission = await submitInstapay(t, booking.id, { transferReference: "TRX-LIST-2", email: booking.customer.email }, validPngBuffer(), "receipt.png", newIdempotencyKey()).expect(201);

    await api(t)
      .post(`${ADMIN_PAYMENTS}/${submission.body.id}/reject`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "Amount does not match our records" })
      .expect(201);

    const res = await api(t).get(`${BOOKINGS}/${booking.id}/payments`).query({ email: booking.customer.email }).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ status: "REJECTED", rejectionReason: "Amount does not match our records" });
  });

  it("rejects access for anyone who isn't the booking's owner (guest wrong email, no auth)", async () => {
    await setTourFree(t, ids.nileSession.id, 5);
    const booking = await createPendingBooking(t, tourQuoteBody(ids.nileSession.id));
    await api(t).get(`${BOOKINGS}/${booking.id}/payments`).expect(404);
    await api(t).get(`${BOOKINGS}/${booking.id}/payments`).query({ email: "someone-else@example.test" }).expect(404);
  });

  it("lets a signed-in owner read their own booking's payments without an email", async () => {
    await setTourFree(t, ids.nileSession.id, 5);
    const user = await createUser(t.prisma, "payments-list-owner");
    const token = await signIn(t, user);
    const quote = await createQuote(t, tourQuoteBody(ids.nileSession.id), token);
    const created = await api(t)
      .post(BOOKINGS)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", newIdempotencyKey())
      .send(bookingBody(quote.id))
      .expect(201);
    const reference = created.body.reference as string;
    await selectCash(t, reference, {}, token).expect(201);

    const res = await api(t).get(`${BOOKINGS}/${reference}/payments`).set("Authorization", `Bearer ${token}`).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ method: "CASH" });
  });
});
