import { createTestApp, TestApp } from "../support/app";
import { loadCatalogue } from "../catalogue/support";
import {
  api,
  BOOKINGS,
  catalogueIds,
  createPendingBooking,
  invalidBuffer,
  newIdempotencyKey,
  PAYMENTS,
  restoreSharedFixtures,
  setTourFree,
  submitInstapay,
  tourQuoteBody,
  validPdfBuffer,
  validPngBuffer,
} from "./support";

describe("InstaPay proof submission (integration)", () => {
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

  it("exposes InstaPay instructions from configuration, not hard-coded", async () => {
    const res = await api(t).get(`${PAYMENTS}/instapay-instructions`).expect(200);
    expect(res.body).toMatchObject({
      recipientName: expect.any(String),
      handle: expect.any(String),
      instructionsText: expect.any(String),
    });
  });

  it("accepts a PNG receipt, moves the booking to PENDING_VERIFICATION state on the payment, leaves the booking PENDING_PAYMENT", async () => {
    await setTourFree(t, ids.nileSession.id, 5);
    const booking = await createPendingBooking(t, tourQuoteBody(ids.nileSession.id));

    const res = await submitInstapay(t, booking.id, { transferReference: "TRX-001", email: booking.customer.email }, validPngBuffer(), "receipt.png", newIdempotencyKey());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ method: "INSTAPAY", status: "PENDING_VERIFICATION", transferReference: "TRX-001" });

    const bookingRow = await api(t).get(`${BOOKINGS}/${booking.id}`).query({ email: booking.customer.email }).expect(200);
    expect(bookingRow.body.status).toBe("PENDING_PAYMENT");

    const payment = await t.prisma.payment.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(payment.proofSubmittedAt).not.toBeNull();
    const media = await t.prisma.media.findFirstOrThrow({ where: { ownerType: "PAYMENT_PROOF", ownerId: payment.id } });
    expect(media.mimeType).toBe("image/png");
  });

  it("also accepts a PDF receipt", async () => {
    await setTourFree(t, ids.nileSession.id, 5);
    const booking = await createPendingBooking(t, tourQuoteBody(ids.nileSession.id));
    const res = await submitInstapay(t, booking.id, { transferReference: "TRX-PDF", email: booking.customer.email }, validPdfBuffer(), "receipt.pdf", newIdempotencyKey());
    expect(res.status).toBe(201);
  });

  it("rejects a file whose content does not match any allowed type, regardless of its extension", async () => {
    await setTourFree(t, ids.nileSession.id, 5);
    const booking = await createPendingBooking(t, tourQuoteBody(ids.nileSession.id));
    const res = await submitInstapay(t, booking.id, { transferReference: "TRX-002", email: booking.customer.email }, invalidBuffer(), "receipt.png", newIdempotencyKey());
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION_FAILED");
  });

  it("rejects a submission with no file attached", async () => {
    await setTourFree(t, ids.nileSession.id, 5);
    const booking = await createPendingBooking(t, tourQuoteBody(ids.nileSession.id));
    const res = await api(t)
      .post(`${BOOKINGS}/${booking.id}/payment/instapay`)
      .set("Idempotency-Key", newIdempotencyKey())
      .field("transferReference", "TRX-003")
      .field("email", booking.customer.email);
    expect(res.status).toBe(400);
  });

  it("rejects a submission missing the transfer reference field", async () => {
    await setTourFree(t, ids.nileSession.id, 5);
    const booking = await createPendingBooking(t, tourQuoteBody(ids.nileSession.id));
    const res = await api(t)
      .post(`${BOOKINGS}/${booking.id}/payment/instapay`)
      .set("Idempotency-Key", newIdempotencyKey())
      .field("email", booking.customer.email)
      .attach("proof", validPngBuffer(), "receipt.png");
    expect(res.status).toBe(422);
  });

  it("requires an Idempotency-Key header", async () => {
    await setTourFree(t, ids.nileSession.id, 5);
    const booking = await createPendingBooking(t, tourQuoteBody(ids.nileSession.id));
    const res = await api(t)
      .post(`${BOOKINGS}/${booking.id}/payment/instapay`)
      .field("transferReference", "TRX-004")
      .field("email", booking.customer.email)
      .attach("proof", validPngBuffer(), "receipt.png");
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("replays the same response for the same idempotency key and the same submission, without creating a second row", async () => {
    await setTourFree(t, ids.nileSession.id, 5);
    const booking = await createPendingBooking(t, tourQuoteBody(ids.nileSession.id));
    const key = newIdempotencyKey();
    const file = validPngBuffer();
    const first = await submitInstapay(t, booking.id, { transferReference: "TRX-005", email: booking.customer.email }, file, "receipt.png", key);
    const second = await submitInstapay(t, booking.id, { transferReference: "TRX-005", email: booking.customer.email }, file, "receipt.png", key);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(await t.prisma.payment.count({ where: { bookingId: booking.id } })).toBe(1);
  });

  it("rejects reusing the same idempotency key for a materially different submission", async () => {
    await setTourFree(t, ids.nileSession.id, 5);
    const booking = await createPendingBooking(t, tourQuoteBody(ids.nileSession.id));
    const key = newIdempotencyKey();
    await submitInstapay(t, booking.id, { transferReference: "TRX-006", email: booking.customer.email }, validPngBuffer(), "receipt.png", key).expect(201);
    const res = await submitInstapay(t, booking.id, { transferReference: "TRX-DIFFERENT", email: booking.customer.email }, validPngBuffer(), "receipt.png", key);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("IDEMPOTENCY_KEY_CONFLICT");
  });

  it("rejects submitting a proof for someone else's booking", async () => {
    await setTourFree(t, ids.nileSession.id, 5);
    const booking = await createPendingBooking(t, tourQuoteBody(ids.nileSession.id));
    const res = await submitInstapay(t, booking.id, { transferReference: "TRX-007", email: "someone-else@example.test" }, validPngBuffer(), "receipt.png", newIdempotencyKey());
    expect(res.status).toBe(404);
  });

  it("rejects submitting a proof for a booking that is no longer awaiting payment", async () => {
    await setTourFree(t, ids.nileSession.id, 5);
    const booking = await createPendingBooking(t, tourQuoteBody(ids.nileSession.id));
    await submitInstapay(t, booking.id, { transferReference: "TRX-008", email: booking.customer.email }, validPngBuffer(), "receipt.png", newIdempotencyKey()).expect(201);
    await api(t).post(`${BOOKINGS}/${booking.id}/cancel`).send({ email: booking.customer.email }).expect(201);
    const res = await submitInstapay(t, booking.id, { transferReference: "TRX-009", email: booking.customer.email }, validPngBuffer(), "receipt.png", newIdempotencyKey());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("BOOKING_NOT_PAYABLE");
  });
});
