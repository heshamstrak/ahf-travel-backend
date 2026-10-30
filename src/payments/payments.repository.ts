import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { Tx } from "../bookings/inventory-hold";

@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------- Idempotency (InstaPay submit only)

  findIdempotencyKey(operation: string, key: string) {
    return this.prisma.idempotencyKey.findUnique({ where: { operation_key: { operation, key } } });
  }

  findIdempotencyKeyInTx(tx: Tx, operation: string, key: string) {
    return tx.idempotencyKey.findUnique({ where: { operation_key: { operation, key } } });
  }

  createIdempotencyKey(tx: Tx, data: Prisma.IdempotencyKeyUncheckedCreateInput) {
    return tx.idempotencyKey.create({ data });
  }

  // -------------------------------------------------------------- Payment

  createPayment(tx: Tx, data: Prisma.PaymentUncheckedCreateInput) {
    return tx.payment.create({ data });
  }

  findPaymentById(id: string) {
    return this.prisma.payment.findUnique({ where: { id } });
  }

  findPaymentByIdInTx(tx: Tx, id: string) {
    return tx.payment.findUnique({ where: { id } });
  }

  findPaymentsByBooking(bookingId: string) {
    return this.prisma.payment.findMany({ where: { bookingId }, orderBy: { createdAt: "desc" } });
  }

  listInstapaySubmissions(status: "PENDING_VERIFICATION" | "SUCCEEDED" | "REJECTED" | undefined, page: number, pageSize: number) {
    const where: Prisma.PaymentWhereInput = { method: "INSTAPAY", ...(status ? { status } : {}) };
    return this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        orderBy: { proofSubmittedAt: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.payment.count({ where }),
    ]);
  }

  /** Guarded approval: only a payment still awaiting review can be approved. Returns null if it was
   *  already approved, already rejected, or (defensively) is not an InstaPay payment at all. */
  async guardedApproveInstapay(tx: Tx, paymentId: string, now: Date, reviewedById: string): Promise<{ id: string } | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "Payment"
         SET "status" = 'SUCCEEDED', "reviewedAt" = ${now}, "reviewedById" = ${reviewedById}::uuid,
             "succeededAt" = ${now}, "updatedAt" = ${now}
       WHERE "id" = ${paymentId}::uuid
         AND "method" = 'INSTAPAY'
         AND "status" = 'PENDING_VERIFICATION'
       RETURNING "id"`;
    return rows[0] ?? null;
  }

  /** Guarded rejection: same guard as approval. Never touches the booking or its inventory — the
   *  booking stays PENDING_PAYMENT, free to receive another proof submission while its hold lasts. */
  async guardedRejectInstapay(
    tx: Tx,
    paymentId: string,
    now: Date,
    reviewedById: string,
    reason: string,
  ): Promise<{ id: string } | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "Payment"
         SET "status" = 'REJECTED', "reviewedAt" = ${now}, "reviewedById" = ${reviewedById}::uuid,
             "rejectionReason" = ${reason}, "updatedAt" = ${now}
       WHERE "id" = ${paymentId}::uuid
         AND "method" = 'INSTAPAY'
         AND "status" = 'PENDING_VERIFICATION'
       RETURNING "id"`;
    return rows[0] ?? null;
  }

  /** Guarded cash-collection record: only a CASH payment still awaiting collection can be marked
   *  collected. Calling this again once it has already succeeded affects zero rows — safe to retry. */
  async guardedMarkCashCollected(tx: Tx, paymentId: string, now: Date): Promise<{ id: string } | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "Payment"
         SET "status" = 'SUCCEEDED', "succeededAt" = ${now}, "updatedAt" = ${now}
       WHERE "id" = ${paymentId}::uuid
         AND "method" = 'CASH'
         AND "status" = 'PENDING'
       RETURNING "id"`;
    return rows[0] ?? null;
  }

  /** The matching guarded booking-level update for a recorded cash collection: a pure summary-field
   *  change (the booking is already CONFIRMED and stays CONFIRMED), guarded so it only ever applies
   *  once. */
  async markBookingPaid(tx: Tx, bookingId: string, now: Date): Promise<{ id: string } | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "Booking"
         SET "paymentStatus" = 'PAID', "updatedAt" = ${now}
       WHERE "id" = ${bookingId}::uuid
         AND "paymentStatus" = 'PAY_LATER'
       RETURNING "id"`;
    return rows[0] ?? null;
  }

  // -------------------------------------------------------------- Media (payment proof)

  createMedia(tx: Tx, data: Prisma.MediaUncheckedCreateInput) {
    return tx.media.create({ data });
  }

  findProofMedia(paymentId: string) {
    return this.prisma.media.findFirst({ where: { ownerType: "PAYMENT_PROOF", ownerId: paymentId } });
  }
}
