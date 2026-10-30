import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { Prisma, Role } from "@prisma/client";
import { randomUUID, createHash } from "crypto";
import { Clock } from "../common/clock";
import { AppError, Errors } from "../common/errors";
import { hashRequest } from "../common/request-hash";
import { writeAudit, AuditActor } from "../common/audit";
import { PricingRejection } from "../pricing/errors";
import { formatMoney, parseMoney } from "../pricing/money";
import { PrismaService } from "../prisma/prisma.service";
import { BookingActor } from "../bookings/bookings.service";
import { BookingsRepository } from "../bookings/bookings.repository";
import { parseIdOrReference } from "../bookings/booking-identifiers";
import { confirmBookingItem } from "../bookings/inventory-confirm";
import { PaymentTransactionHooks } from "./failure-injection";
import { PaymentsRepository } from "./payments.repository";
import { RejectInstapayDto, SelectCashDto, SubmitInstapayProofDto } from "./payments.dto";
import { FILE_STORAGE, FileStorage, generateProofObjectName } from "./storage";
import { validateProofFile } from "./file-validation";

const MAX_IDEMPOTENCY_KEY_LENGTH = 100;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export interface AdminActor {
  id: string;
  role: Role;
}

function money(value: Prisma.Decimal, currency: string): string {
  return formatMoney(parseMoney(value.toString(), currency));
}

type BookingWithItems = NonNullable<Awaited<ReturnType<BookingsRepository["findBookingById"]>>>;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly repo: PaymentsRepository,
    private readonly bookings: BookingsRepository,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly hooks: PaymentTransactionHooks,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  // ================================================================== Lookup and ownership

  private async findBooking(idOrReference: string): Promise<BookingWithItems | null> {
    const parsed = parseIdOrReference(idOrReference);
    return parsed.kind === "id" ? this.bookings.findBookingById(parsed.value) : this.bookings.findBookingByReference(parsed.value);
  }

  private mayAccessBooking(row: { userId: string | null; customerEmail: string }, actor: BookingActor, email: string | undefined): boolean {
    if (actor.userId && row.userId === actor.userId) return true;
    if (email && row.customerEmail.toLowerCase() === email.toLowerCase()) return true;
    return false;
  }

  private auditActor(actor: BookingActor): AuditActor {
    return actor.userId ? { type: "USER", id: actor.userId } : { type: "GUEST" };
  }

  // ================================================================== Cash

  /**
   * CASH is pay-later in V1: selecting it confirms the booking and converts its held inventory to
   * sold immediately, but the Payment row it creates stays PENDING — money has not been collected.
   * One atomic transaction: Payment row, guarded booking confirmation, inventory conversion, audit.
   */
  async selectCash(idOrReference: string, actor: BookingActor, dto: SelectCashDto) {
    const booking = await this.findBooking(idOrReference);
    if (!booking || !this.mayAccessBooking(booking, actor, dto.email)) throw Errors.notFound("Booking");
    if (booking.status !== "PENDING_PAYMENT") {
      throw this.toHttp(new PricingRejection(409, "BOOKING_NOT_PAYABLE", "This booking is not awaiting payment"));
    }

    const now = this.clock.now();
    const actorSnapshot = this.auditActor(actor);
    try {
      await this.prisma.$transaction(async (tx) => {
        const payment = await this.repo.createPayment(tx, {
          id: randomUUID(),
          bookingId: booking.id,
          providerName: null,
          method: "CASH",
          status: "PENDING",
          amount: booking.total,
          currency: booking.currency,
          idempotencyKey: randomUUID(),
          createdAt: now,
        });
        await this.hooks.after("payment_created");
        await writeAudit(tx, {
          actor: actorSnapshot,
          action: "payment.cash_selected",
          aggregateType: "Payment",
          aggregateId: payment.id,
          after: { bookingId: booking.id, amount: payment.amount.toString() },
        });

        const confirmed = await this.bookings.guardedConfirm(tx, booking.id, now, "CASH", "PAY_LATER");
        if (!confirmed) throw new PricingRejection(409, "BOOKING_NOT_CONFIRMABLE", "This booking can no longer be confirmed");
        await this.hooks.after("booking_confirmed");
        await writeAudit(tx, { actor: actorSnapshot, action: "booking.confirmed", aggregateType: "Booking", aggregateId: booking.id, after: { method: "CASH" } });

        await this.convertItems(tx, booking.id, booking.items);
        await writeAudit(tx, { actor: actorSnapshot, action: "inventory.sold", aggregateType: "Booking", aggregateId: booking.id, after: { method: "CASH" } });
      });
    } catch (error) {
      throw this.toHttp(error);
    }

    return this.getBookingPaymentView(booking.id);
  }

  // ================================================================== InstaPay — customer submission

  async submitInstapayProof(
    idOrReference: string,
    actor: BookingActor,
    dto: SubmitInstapayProofDto,
    file: { buffer: Buffer; size: number },
    idempotencyKey: string | undefined,
    maxBytes: number,
  ) {
    this.assertIdempotencyKey(idempotencyKey);
    const key = idempotencyKey!;
    const operation = "payment.instapay_submit";

    const booking = await this.findBooking(idOrReference);
    if (!booking || !this.mayAccessBooking(booking, actor, dto.email)) throw Errors.notFound("Booking");
    if (booking.status !== "PENDING_PAYMENT") {
      throw this.toHttp(new PricingRejection(409, "BOOKING_NOT_PAYABLE", "This booking is not awaiting payment"));
    }

    const validated = validateProofFile(file, maxBytes);
    const fileHash = createHash("sha256").update(file.buffer).digest("hex");
    const requestHash = hashRequest({ bookingId: booking.id, transferReference: dto.transferReference, fileHash });

    const existing = await this.repo.findIdempotencyKey(operation, key);
    if (existing) return this.replayOrConflict(existing.requestHash, existing.responseStatus, existing.responseBody, requestHash);

    // The file write is not transactional with Postgres: it happens first, outside the transaction.
    // If the transaction below fails or rolls back, the written file is simply never referenced by
    // any Media row and is unreachable through the API — an orphan on disk, not a correctness or
    // security issue (documented limitation: nothing currently garbage-collects it).
    const objectName = generateProofObjectName(validated.extension);
    const stored = await this.storage.save(objectName, file.buffer);

    const now = this.clock.now();
    const actorSnapshot = this.auditActor(actor);
    try {
      const outcome = await this.prisma.$transaction(async (tx) => {
        const payment = await this.repo.createPayment(tx, {
          id: randomUUID(),
          bookingId: booking.id,
          providerName: null,
          method: "INSTAPAY",
          status: "PENDING_VERIFICATION",
          amount: booking.total,
          currency: booking.currency,
          idempotencyKey: key,
          transferReference: dto.transferReference,
          proofSubmittedAt: now,
          createdAt: now,
        });
        await this.hooks.after("proof_created");

        await this.repo.createMedia(tx, {
          id: randomUUID(),
          ownerType: "PAYMENT_PROOF",
          ownerId: payment.id,
          storageKey: stored.storageKey,
          variants: {},
          mimeType: validated.mimeType,
          width: 0,
          height: 0,
          sizeBytes: stored.sizeBytes,
          altText: "InstaPay payment proof",
          source: "UPLOAD",
          status: "READY",
          uploadedById: actor.userId ?? null,
          createdAt: now,
        });
        await writeAudit(tx, {
          actor: actorSnapshot,
          action: "payment.instapay_submitted",
          aggregateType: "Payment",
          aggregateId: payment.id,
          after: { bookingId: booking.id, transferReference: dto.transferReference },
        });

        const body = this.toPaymentView(payment);
        const status = HttpStatus.CREATED;
        await this.repo.createIdempotencyKey(tx, {
          operation,
          key,
          requestHash,
          resourceType: "Payment",
          resourceId: payment.id,
          responseStatus: status,
          responseBody: body,
          expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
          createdAt: now,
        });
        return { replayed: false as const, status, body };
      });
      return outcome;
    } catch (error) {
      if (this.isIdempotencyKeyConflict(error)) {
        const winner = await this.repo.findIdempotencyKey(operation, key);
        if (winner) return this.replayOrConflict(winner.requestHash, winner.responseStatus, winner.responseBody, requestHash);
      }
      if (this.isDuplicatePaymentAttempt(error)) {
        // bookingId + idempotencyKey already exists (a second guarantee, same pattern as
        // Booking.quoteId): the IdempotencyKey table said no, so this is almost unreachable, but it
        // is handled the same way for safety.
        const winner = await this.repo.findIdempotencyKey(operation, key);
        if (winner) return this.replayOrConflict(winner.requestHash, winner.responseStatus, winner.responseBody, requestHash);
      }
      throw this.toHttp(error);
    }
  }

  // ================================================================== Proof access

  async getProofFile(paymentId: string, actor: { userId?: string; role?: Role }, email: string | undefined) {
    const payment = await this.repo.findPaymentById(paymentId);
    if (!payment) throw Errors.notFound("Payment proof");
    const booking = await this.bookings.findBookingById(payment.bookingId);
    if (!booking) throw Errors.notFound("Payment proof");

    const isAdmin = actor.role === Role.ADMIN || actor.role === Role.FINANCE;
    if (!isAdmin && !this.mayAccessBooking(booking, { userId: actor.userId }, email)) throw Errors.notFound("Payment proof");

    const media = await this.repo.findProofMedia(paymentId);
    if (!media) throw Errors.notFound("Payment proof");
    const buffer = await this.storage.read(media.storageKey);
    return { buffer, mimeType: media.mimeType };
  }

  // ================================================================== Admin review

  async listInstapaySubmissions(status: "PENDING_VERIFICATION" | "SUCCEEDED" | "REJECTED" | undefined, page: number, pageSize: number) {
    const [rows, total] = await this.repo.listInstapaySubmissions(status, page, pageSize);
    return {
      items: rows.map((p) => this.toAdminPaymentView(p)),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  async getAdminPaymentDetail(paymentId: string) {
    const payment = await this.repo.findPaymentById(paymentId);
    if (!payment) throw Errors.notFound("Payment");
    const booking = await this.bookings.findBookingById(payment.bookingId);
    const media = await this.repo.findProofMedia(paymentId);
    return {
      ...this.toAdminPaymentView(payment),
      proof: media ? { mimeType: media.mimeType, sizeBytes: media.sizeBytes, createdAt: media.createdAt.toISOString() } : null,
      booking: booking
        ? {
            id: booking.id,
            reference: booking.reference,
            status: booking.status,
            total: money(booking.total, booking.currency),
            currency: booking.currency,
            customerEmail: booking.customerEmail,
          }
        : null,
    };
  }

  async approveInstapay(paymentId: string, admin: AdminActor) {
    const payment = await this.repo.findPaymentById(paymentId);
    if (!payment || payment.method !== "INSTAPAY") throw Errors.notFound("Payment");

    const now = this.clock.now();
    const actorSnapshot: AuditActor = { type: "ADMIN", id: admin.id };
    try {
      await this.prisma.$transaction(async (tx) => {
        const approved = await this.repo.guardedApproveInstapay(tx, paymentId, now, admin.id);
        if (!approved) throw new PricingRejection(409, "PAYMENT_NOT_REVIEWABLE", "This payment is no longer awaiting review");
        await writeAudit(tx, { actor: actorSnapshot, action: "payment.instapay_approved", aggregateType: "Payment", aggregateId: paymentId, after: {} });

        // Guarded against the booking having expired or been cancelled first: if that race was
        // lost, this throws and the whole transaction — including the approval above — rolls back.
        // We never silently reacquire inventory for an already-released booking.
        const confirmed = await this.bookings.guardedConfirm(tx, payment.bookingId, now, "INSTAPAY", "PAID");
        if (!confirmed) {
          throw new PricingRejection(409, "BOOKING_NOT_CONFIRMABLE", "This booking is no longer available to confirm");
        }
        await this.hooks.after("booking_confirmed");
        await writeAudit(tx, { actor: actorSnapshot, action: "booking.confirmed", aggregateType: "Booking", aggregateId: payment.bookingId, after: { method: "INSTAPAY" } });

        const items = await this.bookings.itemsOf(tx, payment.bookingId);
        await this.convertItems(tx, payment.bookingId, items);
        await writeAudit(tx, { actor: actorSnapshot, action: "inventory.sold", aggregateType: "Booking", aggregateId: payment.bookingId, after: { method: "INSTAPAY" } });
      });
    } catch (error) {
      throw this.toHttp(error);
    }
    return this.toAdminPaymentView((await this.repo.findPaymentById(paymentId))!);
  }

  async rejectInstapay(paymentId: string, admin: AdminActor, dto: RejectInstapayDto) {
    const payment = await this.repo.findPaymentById(paymentId);
    if (!payment || payment.method !== "INSTAPAY") throw Errors.notFound("Payment");

    const now = this.clock.now();
    try {
      await this.prisma.$transaction(async (tx) => {
        const rejected = await this.repo.guardedRejectInstapay(tx, paymentId, now, admin.id, dto.reason);
        if (!rejected) throw new PricingRejection(409, "PAYMENT_NOT_REVIEWABLE", "This payment is no longer awaiting review");
        await writeAudit(tx, {
          actor: { type: "ADMIN", id: admin.id },
          action: "payment.instapay_rejected",
          aggregateType: "Payment",
          aggregateId: paymentId,
          after: { reason: dto.reason },
        });
      });
    } catch (error) {
      throw this.toHttp(error);
    }
    return this.toAdminPaymentView((await this.repo.findPaymentById(paymentId))!);
  }

  /**
   * Admin records a CASH payment as actually collected. V1 has no other way for a cash payment to
   * reach SUCCEEDED. Idempotent: calling it again once already recorded affects zero rows and is
   * rejected cleanly, never double-collected or double-audited.
   */
  async markCashCollected(paymentId: string, admin: AdminActor) {
    const payment = await this.repo.findPaymentById(paymentId);
    if (!payment || payment.method !== "CASH") throw Errors.notFound("Payment");

    const now = this.clock.now();
    try {
      await this.prisma.$transaction(async (tx) => {
        const collected = await this.repo.guardedMarkCashCollected(tx, paymentId, now);
        if (!collected) throw new PricingRejection(409, "PAYMENT_NOT_COLLECTIBLE", "This payment is not awaiting collection");
        await writeAudit(tx, { actor: { type: "ADMIN", id: admin.id }, action: "payment.cash_collected", aggregateType: "Payment", aggregateId: paymentId, after: {} });
        await this.repo.markBookingPaid(tx, payment.bookingId, now);
      });
    } catch (error) {
      throw this.toHttp(error);
    }
    return this.toAdminPaymentView((await this.repo.findPaymentById(paymentId))!);
  }

  // ================================================================== Shared helpers

  /** Confirms every HELD item of a booking (in practice always exactly one — see bookings.service.ts
   *  planItem). The `first_inventory_conversion` hook fires after the first row of the first item's
   *  own multi-row (hotel night / car day) conversion, mirroring how booking creation hooks its own
   *  first mutation. */
  private async convertItems(tx: Prisma.TransactionClient, bookingId: string, items: BookingWithItems["items"]): Promise<void> {
    for (let i = 0; i < items.length; i++) {
      await confirmBookingItem(tx, items[i], i === 0 ? () => this.hooks.after("first_inventory_conversion") : undefined);
    }
    await this.bookings.updateBookingItemsStatus(tx, bookingId, "CONFIRMED");
    await this.hooks.after("inventory_converted");
  }

  private async getBookingPaymentView(bookingId: string) {
    const payments = await this.repo.findPaymentsByBooking(bookingId);
    return payments.map((p) => this.toPaymentView(p));
  }

  /** Customer-facing read of a booking's own payment attempts — the only way the customer can see
   *  an InstaPay submission's current status and, if rejected, why, so they know whether and how to
   *  resubmit. Same ownership rule as selectCash/submitInstapayProof: the signed-in owner, or a guest
   *  who proves the booking's own email. */
  async listForBooking(idOrReference: string, actor: BookingActor, email: string | undefined) {
    const booking = await this.findBooking(idOrReference);
    if (!booking || !this.mayAccessBooking(booking, actor, email)) throw Errors.notFound("Booking");
    return this.getBookingPaymentView(booking.id);
  }

  private assertIdempotencyKey(key: string | undefined): void {
    if (!key || key.trim().length === 0) {
      throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "IDEMPOTENCY_KEY_REQUIRED", "An Idempotency-Key header is required", undefined, [
        { field: "Idempotency-Key", message: "is required" },
      ]);
    }
    if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_FAILED", "Some fields are invalid", undefined, [
        { field: "Idempotency-Key", message: `must be at most ${MAX_IDEMPOTENCY_KEY_LENGTH} characters` },
      ]);
    }
  }

  private replayOrConflict(storedHash: string, status: number, body: Prisma.JsonValue, requestHash: string) {
    if (storedHash === requestHash) return { replayed: true as const, status, body };
    throw new AppError(HttpStatus.CONFLICT, "IDEMPOTENCY_KEY_CONFLICT", "This idempotency key was already used for a different request");
  }

  private isIdempotencyKeyConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
    const target = error.meta?.target;
    return Array.isArray(target) && target.includes("key") && target.includes("operation");
  }

  private isDuplicatePaymentAttempt(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
    const target = error.meta?.target;
    return Array.isArray(target) && target.includes("bookingId") && target.includes("idempotencyKey");
  }

  private toHttp(error: unknown): unknown {
    if (!(error instanceof PricingRejection)) return error;
    const status =
      error.status === 404
        ? HttpStatus.NOT_FOUND
        : error.status === 409
          ? HttpStatus.CONFLICT
          : error.status === 410
            ? HttpStatus.GONE
            : HttpStatus.UNPROCESSABLE_ENTITY;
    return new AppError(status, error.code, error.message, undefined, error.field ? [{ field: error.field, message: error.message }] : undefined);
  }

  private toPaymentView(payment: {
    id: string;
    method: string;
    status: string;
    amount: Prisma.Decimal;
    currency: string;
    transferReference: string | null;
    proofSubmittedAt: Date | null;
    rejectionReason?: string | null;
    createdAt: Date;
  }) {
    return {
      id: payment.id,
      method: payment.method,
      status: payment.status,
      amount: money(payment.amount, payment.currency),
      currency: payment.currency,
      transferReference: payment.transferReference,
      proofSubmittedAt: payment.proofSubmittedAt ? payment.proofSubmittedAt.toISOString() : null,
      // Only meaningful (and only ever set) when status is REJECTED — the customer needs this to
      // know whether, and how, to resubmit.
      rejectionReason: payment.rejectionReason ?? null,
      createdAt: payment.createdAt.toISOString(),
    };
  }

  private toAdminPaymentView(payment: {
    id: string;
    bookingId: string;
    method: string;
    status: string;
    amount: Prisma.Decimal;
    currency: string;
    transferReference: string | null;
    proofSubmittedAt: Date | null;
    reviewedAt: Date | null;
    reviewedById: string | null;
    rejectionReason: string | null;
    createdAt: Date;
  }) {
    return {
      id: payment.id,
      bookingId: payment.bookingId,
      method: payment.method,
      status: payment.status,
      amount: money(payment.amount, payment.currency),
      currency: payment.currency,
      transferReference: payment.transferReference,
      proofSubmittedAt: payment.proofSubmittedAt ? payment.proofSubmittedAt.toISOString() : null,
      reviewedAt: payment.reviewedAt ? payment.reviewedAt.toISOString() : null,
      reviewedById: payment.reviewedById,
      rejectionReason: payment.rejectionReason,
      createdAt: payment.createdAt.toISOString(),
    };
  }
}
