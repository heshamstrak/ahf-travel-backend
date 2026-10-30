import { randomUUID } from "crypto";
import request from "supertest";
import type { App } from "supertest/types";
import { TestingModuleBuilder } from "@nestjs/testing";
import { createTestApp, TestApp } from "../support/app";
import { hashPassword } from "../../src/security/password";
import { PaymentTransactionHooks } from "../../src/payments/failure-injection";
import {
  BOOKINGS,
  bookingBody,
  carQuoteBody,
  catalogueIds,
  createQuote,
  createUser,
  customer,
  expectProblem,
  hotelQuoteBody,
  isoDay,
  newIdempotencyKey,
  packageQuoteBody,
  PREFIX,
  QUOTES,
  restoreSharedFixtures,
  setCarFree,
  setDepartureFree,
  setRoomFree,
  setTourFree,
  setTransferFree,
  signIn,
  tourQuoteBody,
  transferQuoteBody,
} from "../bookings/support";

export {
  BOOKINGS,
  bookingBody,
  carQuoteBody,
  catalogueIds,
  createQuote,
  createUser,
  customer,
  expectProblem,
  hotelQuoteBody,
  isoDay,
  newIdempotencyKey,
  packageQuoteBody,
  PREFIX,
  QUOTES,
  restoreSharedFixtures,
  setCarFree,
  setDepartureFree,
  setRoomFree,
  setTourFree,
  setTransferFree,
  signIn,
  tourQuoteBody,
  transferQuoteBody,
};

export function api(t: TestApp) {
  return request(t.app.getHttpServer() as App);
}

export const PAYMENTS = `${PREFIX}/payments`;
export const ADMIN_PAYMENTS = `${PREFIX}/admin/payments`;

/** An ADMIN user who can sign in and call the admin review endpoints. */
export async function createAdmin(t: TestApp, label: string): Promise<{ id: string; email: string; password: string }> {
  const password = "correct-horse-battery-staple";
  const email = `${label}-${randomUUID().slice(0, 8)}@example.test`;
  const user = await t.prisma.user.create({
    data: { email, passwordHash: await hashPassword(password), firstName: "Admin", lastName: "User", emailVerifiedAt: new Date(), role: "ADMIN" },
  });
  return { id: user.id, email, password };
}

export function createTestAppWithPaymentHook(hook: PaymentTransactionHooks): Promise<TestApp> {
  return createTestApp({}, (builder: TestingModuleBuilder) => builder.overrideProvider(PaymentTransactionHooks).useValue(hook));
}

/** Creates a real, fresh PENDING_PAYMENT booking over HTTP and returns its body. */
export async function createPendingBooking(t: TestApp, quoteBody: Record<string, unknown>, customerOverrides: Record<string, unknown> = {}) {
  const quote = await createQuote(t, quoteBody);
  const res = await api(t)
    .post(BOOKINGS)
    .set("Idempotency-Key", newIdempotencyKey())
    .send(bookingBody(quote.id, { customer: customer(customerOverrides) }))
    .expect(201);
  return res.body as {
    id: string;
    reference: string;
    status: string;
    paymentStatus: string;
    customer: { email: string };
    totals: { total: string };
  };
}

/** Minimal buffers whose first bytes satisfy file-validation.ts's magic-byte sniffing. Not real,
 *  decodable images/PDFs — validateProofFile never decodes the body, only sniffs its signature. */
export function validPngBuffer(sizeBytes = 256): Buffer {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([header, Buffer.alloc(Math.max(0, sizeBytes - header.length), 1)]);
}

export function validPdfBuffer(sizeBytes = 256): Buffer {
  const header = Buffer.from("%PDF-1.4\n", "ascii");
  return Buffer.concat([header, Buffer.alloc(Math.max(0, sizeBytes - header.length), 1)]);
}

export function invalidBuffer(sizeBytes = 256): Buffer {
  return Buffer.alloc(sizeBytes, 0x41); // "AAAA..." — no recognised magic bytes
}

export function selectCash(t: TestApp, idOrReference: string, body: Record<string, unknown> = {}, bearer?: string) {
  const req = api(t).post(`${BOOKINGS}/${idOrReference}/payment/cash`).send(body);
  if (bearer) req.set("Authorization", `Bearer ${bearer}`);
  return req;
}

export function submitInstapay(
  t: TestApp,
  idOrReference: string,
  fields: { transferReference: string; email?: string },
  file: Buffer,
  filename: string,
  idempotencyKey: string,
  bearer?: string,
) {
  const req = api(t)
    .post(`${BOOKINGS}/${idOrReference}/payment/instapay`)
    .set("Idempotency-Key", idempotencyKey)
    .field("transferReference", fields.transferReference);
  if (fields.email) req.field("email", fields.email);
  if (bearer) req.set("Authorization", `Bearer ${bearer}`);
  return req.attach("proof", file, filename);
}
