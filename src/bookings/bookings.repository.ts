import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { encodeBookingReference } from "./booking-reference";

type Tx = Prisma.TransactionClient;

/** The columns the booking transaction needs from a consumed quote, as returned by raw SQL. */
export interface ConsumedQuote {
  id: string;
  userId: string | null;
  guestTokenHash: string | null;
  productType: string;
  productId: string;
  request: Prisma.JsonValue;
  lines: Prisma.JsonValue;
  currency: string;
  subtotal: Prisma.Decimal;
  discount: Prisma.Decimal;
  surcharge: Prisma.Decimal;
  fee: Prisma.Decimal;
  tax: Prisma.Decimal;
  total: Prisma.Decimal;
  displayCurrency: string | null;
  displayFxRate: Prisma.Decimal | null;
  displayTotal: Prisma.Decimal | null;
  holdMinutes: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class BookingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------- Idempotency

  findIdempotencyKey(operation: string, key: string) {
    return this.prisma.idempotencyKey.findUnique({ where: { operation_key: { operation, key } } });
  }

  /** Reads inside the active transaction: used only after losing the quote race, to see whether the
   *  winner was this same logical request (same idempotency key). */
  findIdempotencyKeyInTx(tx: Tx, operation: string, key: string) {
    return tx.idempotencyKey.findUnique({ where: { operation_key: { operation, key } } });
  }

  /** Written only on success, as the last step of the booking transaction: "a key exists only if its
   *  operation committed" (ARCHITECTURE, Revision 4). A rolled-back attempt leaves no row at all. */
  createIdempotencyKey(tx: Tx, data: Prisma.IdempotencyKeyUncheckedCreateInput) {
    return tx.idempotencyKey.create({ data });
  }

  // -------------------------------------------------------------- Quote consumption

  /**
   * The guarded write that makes "at most one booking per quote" a database fact, not an
   * application check. A single atomic UPDATE, gated by its own WHERE clause: if another
   * transaction already consumed this quote, or it expired, this affects zero rows and the
   * caller (not Node) never had to read-then-decide. `Booking.quoteId` is also UNIQUE, so even a
   * hypothetical bug here could not let two bookings reference the same quote.
   */
  async consumeQuote(tx: Tx, quoteId: string, now: Date): Promise<ConsumedQuote | null> {
    const rows = await tx.$queryRaw<ConsumedQuote[]>`
      UPDATE "Quote"
         SET "consumedAt" = ${now}
       WHERE "id" = ${quoteId}::uuid
         AND "consumedAt" IS NULL
         AND "expiresAt" > ${now}
       RETURNING *`;
    return rows[0] ?? null;
  }

  /** Plain read, used only to report why consumption failed (expired vs. already used vs. missing). */
  findQuote(id: string) {
    return this.prisma.quote.findUnique({ where: { id } });
  }

  findQuoteInTx(tx: Tx, id: string) {
    return tx.quote.findUnique({ where: { id } });
  }

  // -------------------------------------------------------------- Booking reference

  /** One value from the dedicated sequence, scrambled into the public reference format. */
  async nextBookingReference(tx: Tx): Promise<string> {
    const rows = await tx.$queryRaw<{ nextval: bigint | string }[]>`SELECT nextval('booking_reference_seq') AS nextval`;
    const raw = rows[0]?.nextval;
    const value = typeof raw === "bigint" ? raw : BigInt(raw ?? 0);
    return encodeBookingReference(value);
  }

  // -------------------------------------------------------------- Booking and items

  createBooking(tx: Tx, data: Prisma.BookingUncheckedCreateInput) {
    return tx.booking.create({ data });
  }

  createBookingItem(tx: Tx, data: Prisma.BookingItemUncheckedCreateInput) {
    return tx.bookingItem.create({ data });
  }

  findBookingById(id: string) {
    return this.prisma.booking.findUnique({ where: { id }, include: { items: true } });
  }

  findBookingByReference(reference: string) {
    return this.prisma.booking.findUnique({ where: { reference }, include: { items: true } });
  }

  itemsOf(tx: Tx, bookingId: string) {
    return tx.bookingItem.findMany({ where: { bookingId } });
  }

  /**
   * Guarded expiry: moves a booking out of PENDING_PAYMENT only if its hold is actually due. Two
   * workers racing on the same booking cannot both succeed here — whichever's UPDATE commits first
   * changes the status, so the other's WHERE no longer matches and it affects zero rows.
   */
  async guardedExpire(tx: Tx, id: string, now: Date): Promise<{ id: string } | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "Booking"
         SET "status" = 'EXPIRED', "updatedAt" = ${now}, "version" = "version" + 1
       WHERE "id" = ${id}::uuid
         AND "status" = 'PENDING_PAYMENT'
         AND "holdExpiresAt" < ${now}
       RETURNING "id"`;
    return rows[0] ?? null;
  }

  /**
   * Guarded cancellation: the same WHERE "status" = 'PENDING_PAYMENT' guard as expiry, so a
   * cancellation and an expiry racing on the same booking resolve exactly the same way — one of
   * them changes the row, the other finds nothing left to change.
   */
  async guardedCancel(
    tx: Tx,
    id: string,
    now: Date,
    cancelledByType: "USER" | "GUEST" | "ADMIN",
    cancelledById: string | null,
    cancelReason: string | null,
  ): Promise<{ id: string } | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "Booking"
         SET "status" = 'CANCELLED',
             "updatedAt" = ${now},
             "version" = "version" + 1,
             "cancelledAt" = ${now},
             "cancelledByType" = ${cancelledByType}::"ActorType",
             "cancelledById" = ${cancelledById}::uuid,
             "cancelReason" = ${cancelReason}
       WHERE "id" = ${id}::uuid
         AND "status" = 'PENDING_PAYMENT'
       RETURNING "id"`;
    return rows[0] ?? null;
  }

  /** Candidates for expiry. A plain read: the guarded transition above is the actual concurrency guard,
   *  so two workers racing on the same id simply have one of them find zero rows at that step. */
  findExpiredCandidateIds(now: Date, limit: number) {
    return this.prisma.booking.findMany({
      where: { status: "PENDING_PAYMENT", holdExpiresAt: { lt: now } },
      orderBy: { holdExpiresAt: "asc" },
      take: limit,
      select: { id: true },
    });
  }

  updateBookingItemsStatus(tx: Tx, bookingId: string, status: "EXPIRED" | "CANCELLED" | "CONFIRMED") {
    return tx.bookingItem.updateMany({ where: { bookingId }, data: { status } });
  }

  /** The signed-in customer's own bookings (Milestone 7). Scoped by userId at the query level —
   *  never a broader read filtered in Node. */
  findMine(userId: string, status: string | undefined, skip: number, take: number) {
    const where = { userId, ...(status ? { status: status as never } : {}) };
    return Promise.all([
      this.prisma.booking.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { items: true } }),
      this.prisma.booking.count({ where }),
    ]);
  }

  /**
   * Guarded confirmation: the same `WHERE "status" = 'PENDING_PAYMENT'` guard as expiry and
   * cancellation, so a payment confirmation racing against either of those resolves exactly the
   * same way — whichever UPDATE commits first wins, the other affects zero rows. Used by both the
   * cash-confirm and InstaPay-approve flows (Milestone 5), which differ only in `paymentMethod` and
   * `paymentStatus`.
   */
  async guardedConfirm(
    tx: Tx,
    id: string,
    now: Date,
    paymentMethod: "CASH" | "INSTAPAY",
    paymentStatus: "PAY_LATER" | "PAID",
  ): Promise<{ id: string } | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "Booking"
         SET "status" = 'CONFIRMED',
             "updatedAt" = ${now},
             "version" = "version" + 1,
             "confirmedAt" = ${now},
             "paymentMethod" = ${paymentMethod}::"PaymentMethod",
             "paymentStatus" = ${paymentStatus}::"PaymentStatus"
       WHERE "id" = ${id}::uuid
         AND "status" = 'PENDING_PAYMENT'
       RETURNING "id"`;
    return rows[0] ?? null;
  }
}
