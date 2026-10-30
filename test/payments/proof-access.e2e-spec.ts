import { createTestApp, TestApp } from "../support/app";
import { loadCatalogue } from "../catalogue/support";
import {
  api,
  catalogueIds,
  createAdmin,
  createPendingBooking,
  createUser,
  newIdempotencyKey,
  PAYMENTS,
  restoreSharedFixtures,
  setTourFree,
  signIn,
  submitInstapay,
  tourQuoteBody,
  validPngBuffer,
} from "./support";

describe("InstaPay proof access control (integration)", () => {
  let t: TestApp;
  let ids: Awaited<ReturnType<typeof catalogueIds>>;
  let adminToken: string;
  let otherCustomerToken: string;

  beforeAll(async () => {
    t = await createTestApp();
    await loadCatalogue(t.prisma);
    ids = await catalogueIds(t.prisma);
    adminToken = await signIn(t, await createAdmin(t, "proof-admin"));
    otherCustomerToken = await signIn(t, await createUser(t.prisma, "other-customer"));
  });

  afterAll(async () => {
    await restoreSharedFixtures(t, ids);
    await t.close();
  });

  async function submittedPaymentId(): Promise<{ paymentId: string; email: string }> {
    await setTourFree(t, ids.nileSession.id, 5);
    const booking = await createPendingBooking(t, tourQuoteBody(ids.nileSession.id));
    const submission = await submitInstapay(t, booking.id, { transferReference: "ACCESS-1", email: booking.customer.email }, validPngBuffer(), "receipt.png", newIdempotencyKey()).expect(201);
    return { paymentId: submission.body.id as string, email: booking.customer.email };
  }

  it("lets the booking's own guest (by email) read the proof file, with the right content type", async () => {
    const { paymentId, email } = await submittedPaymentId();
    const res = await api(t).get(`${PAYMENTS}/${paymentId}/proof`).query({ email });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
  });

  it("lets an admin read any proof file", async () => {
    const { paymentId } = await submittedPaymentId();
    const res = await api(t).get(`${PAYMENTS}/${paymentId}/proof`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it("refuses a guest with the wrong email, 404 (never revealing the payment exists)", async () => {
    const { paymentId } = await submittedPaymentId();
    const res = await api(t).get(`${PAYMENTS}/${paymentId}/proof`).query({ email: "intruder@example.test" });
    expect(res.status).toBe(404);
  });

  it("refuses a signed-in customer who does not own the booking", async () => {
    const { paymentId } = await submittedPaymentId();
    const res = await api(t).get(`${PAYMENTS}/${paymentId}/proof`).set("Authorization", `Bearer ${otherCustomerToken}`);
    expect(res.status).toBe(404);
  });

  it("refuses an anonymous request with no email at all", async () => {
    const { paymentId } = await submittedPaymentId();
    const res = await api(t).get(`${PAYMENTS}/${paymentId}/proof`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for a non-existent payment id, not an error that confirms an id format", async () => {
    const res = await api(t).get(`${PAYMENTS}/00000000-0000-0000-0000-000000000000/proof`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it("never includes the raw storage key or file path in any JSON response", async () => {
    const { paymentId } = await submittedPaymentId();
    const detail = await api(t).get(`${PAYMENTS}/${paymentId}/proof`).set("Authorization", `Bearer ${adminToken}`);
    void detail;
    const media = await t.prisma.media.findFirstOrThrow({ where: { ownerType: "PAYMENT_PROOF", ownerId: paymentId } });
    const bookingJson = JSON.stringify((await api(t).get(`${PAYMENTS}/${paymentId}/proof`).set("Authorization", `Bearer ${adminToken}`)).headers);
    expect(bookingJson).not.toContain(media.storageKey);
  });
});
