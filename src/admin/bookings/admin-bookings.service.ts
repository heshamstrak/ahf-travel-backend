import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Errors } from "../../common/errors";
import { PrismaService } from "../../prisma/prisma.service";
import { pageMeta } from "../../catalog/common/query";
import { parseIdOrReference } from "../../bookings/booking-identifiers";
import { formatMoney, parseMoney } from "../../pricing/money";
import { AdminActor } from "../common/admin-actor";
import { BookingsService } from "../../bookings/bookings.service";
import { ListBookingsQuery } from "./admin-bookings.dto";

function money(value: Prisma.Decimal, currency: string): string {
  return formatMoney(parseMoney(value.toString(), currency));
}

@Injectable()
export class AdminBookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
  ) {}

  async list(query: ListBookingsQuery) {
    const where: Prisma.BookingWhereInput = {
      ...(query.reference ? { reference: { contains: query.reference, mode: "insensitive" } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.productType ? { items: { some: { productType: query.productType } } } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(`${query.dateFrom}T00:00:00Z`) } : {}),
              ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { items: { select: { productType: true, status: true } } },
      }),
      this.prisma.booking.count({ where }),
    ]);
    return {
      items: rows.map((b) => ({
        id: b.id,
        reference: b.reference,
        status: b.status,
        paymentStatus: b.paymentStatus,
        paymentMethod: b.paymentMethod,
        total: money(b.total, b.currency),
        currency: b.currency,
        customerEmail: b.customerEmail,
        productTypes: [...new Set(b.items.map((i) => i.productType))],
        createdAt: b.createdAt.toISOString(),
      })),
      meta: pageMeta(query.page, query.pageSize, total),
    };
  }

  async detail(idOrReference: string) {
    const parsed = parseIdOrReference(idOrReference);
    const row = parsed.kind === "id" ? await this.prisma.booking.findUnique({ where: { id: parsed.value }, include: { items: true, payments: true } }) : await this.prisma.booking.findUnique({ where: { reference: parsed.value }, include: { items: true, payments: true } });
    if (!row) throw Errors.notFound("Booking");
    const history = await this.prisma.auditEvent.findMany({ where: { aggregateType: "Booking", aggregateId: row.id }, orderBy: { id: "asc" } });

    return {
      id: row.id,
      reference: row.reference,
      status: row.status,
      paymentStatus: row.paymentStatus,
      paymentMethod: row.paymentMethod,
      currency: row.currency,
      totals: {
        subtotal: money(row.subtotal, row.currency),
        discount: money(row.discount, row.currency),
        surcharge: money(row.surcharge, row.currency),
        fee: money(row.fee, row.currency),
        tax: money(row.tax, row.currency),
        total: money(row.total, row.currency),
      },
      customer: {
        firstName: row.customerFirstName,
        lastName: row.customerLastName,
        email: row.customerEmail,
        phone: row.customerPhone,
        countryCode: row.customerCountryCode,
        isGuest: row.userId === null,
      },
      specialRequests: row.specialRequests,
      holdExpiresAt: row.holdExpiresAt?.toISOString() ?? null,
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      cancelReason: row.cancelReason,
      createdAt: row.createdAt.toISOString(),
      items: row.items.map((i) => ({
        productType: i.productType,
        startsAt: i.startsAt.toISOString(),
        endsAt: i.endsAt.toISOString(),
        quantity: i.quantity,
        status: i.status,
        details: i.details,
        product: i.productSnapshot,
        unitPrice: money(i.unitPrice, i.currency),
        lineTotal: money(i.lineTotal, i.currency),
      })),
      payments: row.payments.map((p) => ({
        id: p.id,
        method: p.method,
        status: p.status,
        amount: money(p.amount, p.currency),
        currency: p.currency,
        transferReference: p.transferReference,
        createdAt: p.createdAt.toISOString(),
      })),
      history: history.map((e) => ({ action: e.action, actorType: e.actorType, actorEmail: e.actorEmail, occurredAt: e.occurredAt.toISOString() })),
    };
  }

  /** Delegates entirely to BookingsService.adminCancel — the same guarded transition and
   *  inventory release as every other cancellation path, never a parallel implementation. */
  async cancel(idOrReference: string, admin: AdminActor, reason: string | undefined) {
    return this.bookings.adminCancel(idOrReference, admin, reason);
  }
}
