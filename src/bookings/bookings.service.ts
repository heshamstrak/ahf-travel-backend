import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { addDays } from "../common/business-date";
import { Clock } from "../common/clock";
import { AppError, Errors } from "../common/errors";
import { hashRequest } from "../common/request-hash";
import { writeAudit, AuditActor } from "../common/audit";
import { PricingRejection } from "../pricing/errors";
import { formatMoney, parseMoney } from "../pricing/money";
import { PrismaService } from "../prisma/prisma.service";
import { parseIdOrReference } from "./booking-identifiers";
import { BookingTransactionHooks } from "./failure-injection";
import { BookingsRepository, ConsumedQuote } from "./bookings.repository";
import { CancelBookingDto, CreateBookingDto, ListMyBookingsQuery } from "./bookings.dto";
import { pageMeta } from "../catalog/common/query";
import { holdCar, holdHotel, holdPackage, holdTour, holdTransfer, releaseBookingItem } from "./inventory-hold";

export interface BookingActor {
  userId?: string;
}

/** Idempotency keys are scoped to this operation and kept long enough to cover realistic retries
 *  (a slow connection, a client retry loop) without growing the table forever. Not a business rule,
 *  so it is a code constant rather than a Setting. */
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 100;

const dayDate = (date: string): Date => new Date(`${date}T00:00:00Z`);

interface StoredLine {
  kind: string;
  code: string;
  amount: string;
  unitAmount: string | null;
}

/** A representative per-unit price for display. The authoritative breakdown is the full `priceBreakdown`. */
function baseUnitPrice(lines: Prisma.JsonValue): string {
  const list = (lines as unknown as StoredLine[] | null) ?? [];
  const base = list.find((line) => line.kind === "BASE");
  return base?.unitAmount ?? base?.amount ?? "0.00";
}

/** Stored decimals are shown with the currency's exponent, so 7956 becomes "7956.00". */
function money(value: Prisma.Decimal, currency: string): string {
  return formatMoney(parseMoney(value.toString(), currency));
}

function amountText(value: Prisma.Decimal, currency: string): { amount: string; currency: string } {
  return { amount: money(value, currency), currency };
}

interface ItemPlan {
  /** The top-level product id, per BookingItem's own convention (hotelId | tourId | carModelId | transferRateId | packageId). */
  productId: string;
  fks: Partial<Prisma.BookingItemUncheckedCreateInput>;
  startsAt: Date;
  endsAt: Date;
  quantity: number;
  adults: number | null;
  children: number | null;
  details: Record<string, unknown>;
  hold: (tx: Prisma.TransactionClient, onFirstMutation?: () => Promise<void>) => Promise<void>;
}

type BookingWithItems = NonNullable<Awaited<ReturnType<BookingsRepository["findBookingById"]>>>;
type BookingItemRow = BookingWithItems["items"][number];
type BookingRow = Omit<BookingWithItems, "items">;

@Injectable()
export class BookingsService {
  constructor(
    private readonly repo: BookingsRepository,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly hooks: BookingTransactionHooks,
  ) {}

  // ================================================================== Create

  /**
   * Turns a valid, unconsumed quote into a booking: one atomic transaction consumes the quote,
   * creates the booking and its item, holds inventory, and writes the audit trail. Every price
   * comes from the quote; the client supplies only its own contact details.
   */
  async create(dto: CreateBookingDto, actor: BookingActor, idempotencyKey: string | undefined) {
    this.assertIdempotencyKey(idempotencyKey);
    const key = idempotencyKey!;
    const operation = "booking.create";
    const requestHash = hashRequest({ quoteId: dto.quoteId, customer: dto.customer, specialRequests: dto.specialRequests ?? null });

    // Sequential replay and early conflict detection. Harmless if it misses a true race: the
    // transaction below is the actual guard, this is only a fast path.
    const existing = await this.repo.findIdempotencyKey(operation, key);
    if (existing) return this.replayOrConflict(existing.requestHash, existing.responseStatus, existing.responseBody, requestHash);

    const now = this.clock.now();
    try {
      const outcome = await this.prisma.$transaction(async (tx) => {
        const quote = await this.repo.consumeQuote(tx, dto.quoteId, now);
        if (!quote) return this.resolveLostQuoteRace(tx, dto.quoteId, operation, key, requestHash);
        await this.hooks.after("quote_consumed");

        const actorSnapshot = this.auditActor(actor);
        await writeAudit(tx, {
          actor: actorSnapshot,
          action: "quote.consumed",
          aggregateType: "Quote",
          aggregateId: quote.id,
          after: { productType: quote.productType, productId: quote.productId },
        });

        const bookingId = randomUUID();
        const reference = await this.repo.nextBookingReference(tx);
        const holdExpiresAt = new Date(now.getTime() + quote.holdMinutes * 60_000);

        const booking = await this.repo.createBooking(tx, {
          id: bookingId,
          reference,
          userId: actor.userId ?? null,
          quoteId: quote.id,
          status: "PENDING_PAYMENT",
          paymentStatus: "UNPAID",
          currency: quote.currency,
          displayCurrency: quote.displayCurrency ?? quote.currency,
          displayFxRate: quote.displayFxRate,
          subtotal: quote.subtotal,
          discount: quote.discount,
          surcharge: quote.surcharge,
          fee: quote.fee,
          tax: quote.tax,
          total: quote.total,
          priceBreakdown: (quote.lines ?? Prisma.JsonNull),
          cancellationPolicySnapshot: this.cancellationPolicyOf(quote),
          customerFirstName: dto.customer.firstName,
          customerLastName: dto.customer.lastName,
          customerEmail: dto.customer.email.toLowerCase(),
          customerPhone: dto.customer.phone,
          customerCountryCode: dto.customer.countryCode,
          specialRequests: dto.specialRequests ?? null,
          holdExpiresAt,
          holdMinutes: quote.holdMinutes,
          createdAt: now,
        });
        await this.hooks.after("booking_created");
        await writeAudit(tx, {
          actor: actorSnapshot,
          action: "booking.created",
          aggregateType: "Booking",
          aggregateId: booking.id,
          after: { reference: booking.reference, quoteId: quote.id, total: booking.total.toString() },
        });

        const plan = this.planItem(quote);
        const item = await this.repo.createBookingItem(tx, {
          bookingId: booking.id,
          productType: quote.productType as never,
          productId: plan.productId,
          ...plan.fks,
          startsAt: plan.startsAt,
          endsAt: plan.endsAt,
          quantity: plan.quantity,
          adults: plan.adults,
          children: plan.children,
          details: plan.details as Prisma.InputJsonValue,
          productSnapshot: this.productSnapshotOf(quote),
          currency: quote.currency,
          unitPrice: baseUnitPrice(quote.lines),
          lineTotal: quote.subtotal.toString(),
          status: "HELD",
          createdAt: now,
        });
        await this.hooks.after("booking_item_created");

        await plan.hold(tx, () => this.hooks.after("first_inventory_mutation"));
        await this.hooks.after("inventory_held");
        await writeAudit(tx, {
          actor: actorSnapshot,
          action: "inventory.held",
          aggregateType: "BookingItem",
          aggregateId: item.id,
          after: { productType: quote.productType, quantity: plan.quantity },
        });

        const body = this.toView(booking, [item]);
        const status = HttpStatus.CREATED;
        await this.repo.createIdempotencyKey(tx, {
          operation,
          key,
          requestHash,
          resourceType: "Booking",
          resourceId: booking.id,
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
      throw this.toHttp(error);
    }
  }

  /**
   * Called from inside the transaction when this request lost the quote-consumption race. If the
   * winner used our own idempotency key, this is not a conflict: it is the same logical request,
   * already completed by a concurrent copy of this call, so we adopt its result. Otherwise the
   * quote genuinely belongs to someone else's request.
   */
  private async resolveLostQuoteRace(
    tx: Prisma.TransactionClient,
    quoteId: string,
    operation: string,
    key: string,
    requestHash: string,
  ): Promise<{ replayed: true; status: number; body: Prisma.JsonValue }> {
    const twin = await this.repo.findIdempotencyKeyInTx(tx, operation, key);
    if (twin) {
      if (twin.requestHash === requestHash) return { replayed: true, status: twin.responseStatus, body: twin.responseBody };
      throw new PricingRejection(409, "IDEMPOTENCY_KEY_CONFLICT", "This idempotency key was already used for a different request");
    }
    const current = await this.repo.findQuoteInTx(tx, quoteId);
    if (!current) throw new PricingRejection(404, "NOT_FOUND", "Quote was not found");
    if (current.consumedAt !== null) throw new PricingRejection(409, "QUOTE_ALREADY_CONSUMED", "This quote has already been used for a booking");
    throw new PricingRejection(410, "QUOTE_EXPIRED", "This quote has expired");
  }

  private replayOrConflict(storedHash: string, status: number, body: Prisma.JsonValue, requestHash: string) {
    if (storedHash === requestHash) return { replayed: true as const, status, body };
    throw new AppError(HttpStatus.CONFLICT, "IDEMPOTENCY_KEY_CONFLICT", "This idempotency key was already used for a different request");
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

  private isIdempotencyKeyConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
    const target = error.meta?.target;
    return Array.isArray(target) && target.includes("key") && target.includes("operation");
  }

  // ================================================================== Read and cancel

  async get(idOrReference: string, actor: BookingActor, email: string | undefined) {
    const parsed = parseIdOrReference(idOrReference);
    const row = parsed.kind === "id" ? await this.repo.findBookingById(parsed.value) : await this.repo.findBookingByReference(parsed.value);
    if (!row || !this.mayAccess(row, actor, email)) throw Errors.notFound("Booking");
    return this.toView(row, row.items);
  }

  /** Milestone 7: the signed-in customer's own bookings, paginated. Added because My Bookings has
   *  no mock-era backend equivalent to replace — there was previously only reference+email lookup
   *  for a single booking, never an index. Guests have no persistent identity to list by. */
  async listMine(userId: string, query: ListMyBookingsQuery) {
    const [rows, total] = await this.repo.findMine(userId, query.status, (query.page - 1) * query.pageSize, query.pageSize);
    return { items: rows.map((row) => this.toView(row, row.items)), meta: pageMeta(query.page, query.pageSize, total) };
  }

  /**
   * Cancels a booking that is still only holding inventory (the only state reachable before
   * payment integration). The status transition, the inventory release and the audit trail all
   * commit together, or none of them do.
   */
  async cancel(idOrReference: string, actor: BookingActor, dto: CancelBookingDto) {
    const parsed = parseIdOrReference(idOrReference);
    const existing = parsed.kind === "id" ? await this.repo.findBookingById(parsed.value) : await this.repo.findBookingByReference(parsed.value);
    if (!existing || !this.mayAccess(existing, actor, dto.email)) throw Errors.notFound("Booking");

    const now = this.clock.now();
    const actorSnapshot = this.auditActor(actor);
    const cancelledByType: "USER" | "GUEST" = actor.userId ? "USER" : "GUEST";

    try {
      await this.prisma.$transaction(async (tx) => {
        const guardedRow = await this.repo.guardedCancel(tx, existing.id, now, cancelledByType, actor.userId ?? null, dto.reason ?? null);
        if (!guardedRow) {
          throw new PricingRejection(409, "BOOKING_NOT_CANCELLABLE", "This booking can no longer be cancelled");
        }
        const items = await this.repo.itemsOf(tx, existing.id);
        for (const item of items) await releaseBookingItem(tx, item);
        await this.repo.updateBookingItemsStatus(tx, existing.id, "CANCELLED");
        await writeAudit(tx, {
          actor: actorSnapshot,
          action: "inventory.released",
          aggregateType: "Booking",
          aggregateId: existing.id,
          after: { reason: "cancelled" },
        });
        await writeAudit(tx, {
          actor: actorSnapshot,
          action: "booking.cancelled",
          aggregateType: "Booking",
          aggregateId: existing.id,
          after: { reason: dto.reason ?? null },
        });
      });
    } catch (error) {
      throw this.toHttp(error);
    }

    const updated = await this.repo.findBookingById(existing.id);
    return this.toView(updated!, updated!.items);
  }

  /**
   * Admin-initiated cancellation (Milestone 6): the same guarded transition, inventory release
   * and audit trail as `cancel()` above — never a different, weaker code path — but with no
   * ownership check, since an admin must be able to act on any customer's or guest's booking, and
   * an ADMIN-typed audit actor rather than USER/GUEST, so the trail always shows who really acted.
   */
  async adminCancel(idOrReference: string, admin: { id: string; email: string; name: string; role: string }, reason: string | undefined) {
    const parsed = parseIdOrReference(idOrReference);
    const existing = parsed.kind === "id" ? await this.repo.findBookingById(parsed.value) : await this.repo.findBookingByReference(parsed.value);
    if (!existing) throw Errors.notFound("Booking");

    const now = this.clock.now();
    const actorSnapshot: AuditActor = { type: "ADMIN", id: admin.id, email: admin.email, name: admin.name, role: admin.role };

    try {
      await this.prisma.$transaction(async (tx) => {
        const guardedRow = await this.repo.guardedCancel(tx, existing.id, now, "ADMIN", admin.id, reason ?? null);
        if (!guardedRow) {
          throw new PricingRejection(409, "BOOKING_NOT_CANCELLABLE", "This booking can no longer be cancelled");
        }
        const items = await this.repo.itemsOf(tx, existing.id);
        for (const item of items) await releaseBookingItem(tx, item);
        await this.repo.updateBookingItemsStatus(tx, existing.id, "CANCELLED");
        await writeAudit(tx, { actor: actorSnapshot, action: "inventory.released", aggregateType: "Booking", aggregateId: existing.id, after: { reason: "cancelled_by_admin" } });
        await writeAudit(tx, { actor: actorSnapshot, action: "booking.cancelled", aggregateType: "Booking", aggregateId: existing.id, after: { reason: reason ?? null } });
      });
    } catch (error) {
      throw this.toHttp(error);
    }

    const updated = await this.repo.findBookingById(existing.id);
    return this.toView(updated!, updated!.items);
  }

  private mayAccess(row: { userId: string | null; customerEmail: string }, actor: BookingActor, email: string | undefined): boolean {
    if (actor.userId && row.userId === actor.userId) return true;
    if (email && row.customerEmail.toLowerCase() === email.toLowerCase()) return true;
    return false;
  }

  private auditActor(actor: BookingActor): AuditActor {
    return actor.userId ? { type: "USER", id: actor.userId } : { type: "GUEST" };
  }

  // ================================================================== Per-product item planning

  private planItem(quote: ConsumedQuote): ItemPlan {
    switch (quote.productType) {
      case "HOTEL":
        return this.planHotel(quote);
      case "TOUR":
        return this.planTour(quote);
      case "CAR":
        return this.planCar(quote);
      case "TRANSFER":
        return this.planTransfer(quote);
      case "PACKAGE":
        return this.planPackage(quote);
      default:
        throw new Error(`unknown product type ${quote.productType}`);
    }
  }

  private requestOf(quote: ConsumedQuote): { selection: Record<string, never>; product: Record<string, never> } {
    return quote.request as never;
  }

  private cancellationPolicyOf(quote: ConsumedQuote): Prisma.InputJsonValue {
    const req = this.requestOf(quote) as unknown as { product: { cancellationPolicy: Prisma.InputJsonValue } };
    return req.product.cancellationPolicy ?? {};
  }

  private productSnapshotOf(quote: ConsumedQuote): Prisma.InputJsonValue {
    const req = this.requestOf(quote) as unknown as { product: Prisma.InputJsonValue };
    return req.product;
  }

  private planHotel(quote: ConsumedQuote): ItemPlan {
    const req = this.requestOf(quote) as unknown as {
      selection: { checkIn: string; checkOut: string; nights: number; rooms: number; adults: number; children: number };
      product: { hotel: { id: string }; room: { id: string } };
    };
    const { selection: sel, product: prod } = req;
    const nightDates = Array.from({ length: sel.nights }, (_, i) => addDays(sel.checkIn, i));
    return {
      productId: prod.hotel.id,
      fks: { hotelId: prod.hotel.id, roomId: prod.room.id, ratePlanId: quote.productId },
      startsAt: dayDate(sel.checkIn),
      endsAt: dayDate(sel.checkOut),
      quantity: sel.rooms,
      adults: sel.adults,
      children: sel.children,
      details: { nights: sel.nights },
      hold: (tx, onFirst) => holdHotel(tx, { roomId: prod.room.id, nightDates, rooms: sel.rooms }, onFirst),
    };
  }

  private planTour(quote: ConsumedQuote): ItemPlan {
    const req = this.requestOf(quote) as unknown as {
      selection: { participants: number };
      product: { tour: { id: string }; session: { startsAt: string } };
    };
    const { selection: sel, product: prod } = req;
    const startsAt = new Date(prod.session.startsAt);
    return {
      productId: prod.tour.id,
      fks: { tourId: prod.tour.id, tourSessionId: quote.productId },
      startsAt,
      endsAt: startsAt,
      quantity: sel.participants,
      adults: null,
      children: null,
      details: { participants: sel.participants },
      hold: (tx, onFirst) => holdTour(tx, { tourSessionId: quote.productId, participants: sel.participants }, onFirst),
    };
  }

  private planCar(quote: ConsumedQuote): ItemPlan {
    const req = this.requestOf(quote) as unknown as {
      selection: { pickupDate: string; dropoffDate: string; driverAge: number; days: number };
      product: { pickupLocation: { id: string } };
    };
    const { selection: sel, product: prod } = req;
    const dayDates = Array.from({ length: sel.days }, (_, i) => addDays(sel.pickupDate, i));
    return {
      productId: quote.productId,
      fks: { carModelId: quote.productId, pickupLocationId: prod.pickupLocation.id },
      startsAt: dayDate(sel.pickupDate),
      endsAt: dayDate(sel.dropoffDate),
      quantity: 1,
      adults: null,
      children: null,
      details: { days: sel.days, driverAge: sel.driverAge },
      hold: (tx, onFirst) => holdCar(tx, { carModelId: quote.productId, locationId: prod.pickupLocation.id, dayDates }, onFirst),
    };
  }

  private planTransfer(quote: ConsumedQuote): ItemPlan {
    const req = this.requestOf(quote) as unknown as {
      selection: { date: string; passengers: number; luggage: number };
      product: { vehicleClass: { id: string } };
    };
    const { selection: sel, product: prod } = req;
    return {
      productId: quote.productId,
      fks: { transferRateId: quote.productId },
      startsAt: dayDate(sel.date),
      endsAt: dayDate(sel.date),
      quantity: 1,
      adults: null,
      children: null,
      details: { date: sel.date, passengers: sel.passengers, luggage: sel.luggage, vehicleClassId: prod.vehicleClass.id },
      hold: (tx, onFirst) => holdTransfer(tx, { vehicleClassId: prod.vehicleClass.id, date: sel.date }, onFirst),
    };
  }

  private planPackage(quote: ConsumedQuote): ItemPlan {
    const req = this.requestOf(quote) as unknown as {
      selection: { adults: number; children: number; rooms?: number };
      product: { package: { id: string }; departure: { startsOn: string } };
    };
    const { selection: sel, product: prod } = req;
    const travellers = sel.adults + sel.children;
    const departureDate = dayDate(prod.departure.startsOn);
    return {
      productId: prod.package.id,
      fks: { packageDepartureId: quote.productId },
      startsAt: departureDate,
      endsAt: departureDate,
      quantity: travellers,
      adults: sel.adults,
      children: sel.children,
      details: { adults: sel.adults, children: sel.children, ...(sel.rooms !== undefined ? { rooms: sel.rooms } : {}) },
      hold: (tx, onFirst) => holdPackage(tx, { packageDepartureId: quote.productId, travellers }, onFirst),
    };
  }

  // ================================================================== Error mapping and view

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

  private toView(booking: BookingRow, items: BookingItemRow[]) {
    return {
      id: booking.id,
      reference: booking.reference,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      currency: booking.currency,
      totals: {
        subtotal: money(booking.subtotal, booking.currency),
        discount: money(booking.discount, booking.currency),
        surcharge: money(booking.surcharge, booking.currency),
        fee: money(booking.fee, booking.currency),
        tax: money(booking.tax, booking.currency),
        total: money(booking.total, booking.currency),
        currency: booking.currency,
      },
      customer: {
        firstName: booking.customerFirstName,
        lastName: booking.customerLastName,
        email: booking.customerEmail,
        phone: booking.customerPhone,
        countryCode: booking.customerCountryCode,
      },
      specialRequests: booking.specialRequests,
      cancellationPolicy: booking.cancellationPolicySnapshot,
      holdExpiresAt: booking.holdExpiresAt ? booking.holdExpiresAt.toISOString() : null,
      holdMinutes: booking.holdMinutes,
      cancelledAt: booking.cancelledAt ? booking.cancelledAt.toISOString() : null,
      cancelReason: booking.cancelReason,
      createdAt: booking.createdAt.toISOString(),
      items: items.map((item) => ({
        productType: item.productType,
        startsAt: item.startsAt.toISOString(),
        endsAt: item.endsAt.toISOString(),
        quantity: item.quantity,
        adults: item.adults,
        children: item.children,
        unitPrice: amountText(item.unitPrice, item.currency),
        lineTotal: amountText(item.lineTotal, item.currency),
        status: item.status,
        details: item.details,
        product: item.productSnapshot,
      })),
    };
  }
}
