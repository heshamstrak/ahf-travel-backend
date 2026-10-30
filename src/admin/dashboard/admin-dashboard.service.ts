import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { formatMoney, parseMoney } from "../../pricing/money";
import { validationFailed } from "../../common/errors";
import type { DashboardAnalyticsQuery } from "./admin-dashboard.dto";

const BASE_CURRENCY = "EGP";

function money(value: { toString(): string } | null, currency = BASE_CURRENCY): string {
  return formatMoney(parseMoney((value ?? "0").toString(), currency));
}

/**
 * Every number here is read directly from the database at request time — no cached or
 * precomputed rollups, so it is never stale. Financial figures are kept in EGP, the platform's
 * base currency (Setting "currency.base"); bookings priced in another settlement currency are not
 * included in the headline sums, a known simplification for a first dashboard (see the milestone
 * report). "Total transfers" counts active TransferRate rows (sellable routes), the closest
 * transfer-side equivalent of a hotel/tour/car/package listing.
 */
@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startOfTomorrow = new Date(startOfToday.getTime() + 86_400_000);

    const [
      totalBookings,
      confirmedBookings,
      pendingBookings,
      cancelledBookings,
      expiredBookings,
      todayBookings,
      totalHotels,
      totalTours,
      totalCars,
      totalTransfers,
      totalPackages,
      pendingInstapayVerifications,
      outstandingCash,
      confirmedValue,
      collectedRevenue,
      recentBookings,
      pendingPaymentReviews,
    ] = await Promise.all([
      this.prisma.booking.count(),
      this.prisma.booking.count({ where: { status: "CONFIRMED" } }),
      this.prisma.booking.count({ where: { status: "PENDING_PAYMENT" } }),
      this.prisma.booking.count({ where: { status: "CANCELLED" } }),
      this.prisma.booking.count({ where: { status: "EXPIRED" } }),
      this.prisma.booking.count({ where: { createdAt: { gte: startOfToday, lt: startOfTomorrow } } }),
      this.prisma.hotel.count({ where: { deletedAt: null } }),
      this.prisma.tour.count({ where: { deletedAt: null } }),
      this.prisma.carModel.count({ where: { deletedAt: null } }),
      this.prisma.transferRate.count({ where: { isActive: true } }),
      this.prisma.package.count({ where: { deletedAt: null } }),
      this.prisma.payment.count({ where: { method: "INSTAPAY", status: "PENDING_VERIFICATION" } }),
      this.prisma.payment.aggregate({ where: { method: "CASH", status: "PENDING" }, _count: true, _sum: { amount: true } }),
      this.prisma.booking.aggregate({ where: { status: "CONFIRMED", currency: BASE_CURRENCY }, _sum: { total: true } }),
      this.prisma.payment.aggregate({ where: { status: "SUCCEEDED", currency: BASE_CURRENCY }, _sum: { amount: true } }),
      this.prisma.booking.findMany({ orderBy: { createdAt: "desc" }, take: 10, select: { id: true, reference: true, status: true, paymentStatus: true, total: true, currency: true, customerEmail: true, createdAt: true } }),
      this.prisma.payment.findMany({
        where: { method: "INSTAPAY", status: "PENDING_VERIFICATION" },
        orderBy: { proofSubmittedAt: "asc" },
        take: 10,
        select: { id: true, bookingId: true, amount: true, currency: true, transferReference: true, proofSubmittedAt: true },
      }),
    ]);

    return {
      bookings: { total: totalBookings, confirmed: confirmedBookings, pending: pendingBookings, cancelled: cancelledBookings, expired: expiredBookings, today: todayBookings },
      catalogue: { hotels: totalHotels, tours: totalTours, cars: totalCars, transfers: totalTransfers, packages: totalPackages },
      payments: {
        pendingInstapayVerifications,
        outstandingCashCollections: { count: outstandingCash._count, amount: money(outstandingCash._sum.amount) },
      },
      // Named distinctly and deliberately: confirmedBookingValue is the value of bookings the
      // platform has committed to (whether or not the cash has actually been collected yet);
      // collectedRevenue is money that has actually changed hands (InstaPay approved or cash
      // recorded as collected). The two are never conflated — an unpaid cash booking adds to the
      // first and not the second until an admin records it collected.
      financials: {
        confirmedBookingValue: money(confirmedValue._sum.total),
        collectedRevenue: money(collectedRevenue._sum.amount),
        currency: BASE_CURRENCY,
      },
      recentBookings: recentBookings.map((b) => ({ id: b.id, reference: b.reference, status: b.status, paymentStatus: b.paymentStatus, total: money(b.total, b.currency), currency: b.currency, customerEmail: b.customerEmail, createdAt: b.createdAt.toISOString() })),
      pendingPaymentReviews: pendingPaymentReviews.map((p) => ({ id: p.id, bookingId: p.bookingId, amount: money(p.amount, p.currency), currency: p.currency, transferReference: p.transferReference, proofSubmittedAt: p.proofSubmittedAt?.toISOString() ?? null })),
    };
  }

  /**
   * Time-series and breakdown data for the dashboard's charts, over an explicit [from, to] window
   * (inclusive, UTC days) the caller always resolves first — "Today"/"7 Days"/"30 Days"/a custom
   * range all become concrete dates before this is called, so there is no hidden default window.
   * Every series is read live from the database, same as overview() — never fabricated or cached.
   */
  async analytics(query: DashboardAnalyticsQuery) {
    const from = new Date(`${query.from}T00:00:00.000Z`);
    const to = new Date(`${query.to}T23:59:59.999Z`);
    if (to < from) throw validationFailed([{ field: "to", message: "must be on or after from" }]);

    const [bookingsByDay, statusGroups, categoryRows, revenueByDay, methodGroups] = await Promise.all([
      this.prisma.$queryRaw<{ day: Date; count: bigint }[]>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
        FROM "Booking"
        WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
        GROUP BY day ORDER BY day ASC
      `,
      this.prisma.booking.groupBy({ by: ["status"], where: { createdAt: { gte: from, lte: to } }, _count: true }),
      this.prisma.$queryRaw<{ productType: string; count: bigint }[]>`
        SELECT bi."productType" AS "productType", COUNT(*)::bigint AS count
        FROM "BookingItem" bi
        JOIN "Booking" b ON b.id = bi."bookingId"
        WHERE b."createdAt" >= ${from} AND b."createdAt" <= ${to}
        GROUP BY bi."productType" ORDER BY count DESC
      `,
      this.prisma.$queryRaw<{ day: Date; amount: string }[]>`
        SELECT date_trunc('day', "createdAt") AS day, COALESCE(SUM(amount), 0)::text AS amount
        FROM "Payment"
        WHERE status = 'SUCCEEDED' AND currency = ${BASE_CURRENCY} AND "createdAt" >= ${from} AND "createdAt" <= ${to}
        GROUP BY day ORDER BY day ASC
      `,
      this.prisma.payment.groupBy({ by: ["method"], where: { status: "SUCCEEDED", currency: BASE_CURRENCY, createdAt: { gte: from, lte: to } }, _sum: { amount: true } }),
    ]);

    const cash = methodGroups.find((m) => m.method === "CASH")?._sum.amount ?? null;
    const instapay = methodGroups.find((m) => m.method === "INSTAPAY")?._sum.amount ?? null;

    return {
      currency: BASE_CURRENCY,
      bookingsOverTime: bookingsByDay.map((r) => ({ date: r.day.toISOString().slice(0, 10), count: Number(r.count) })),
      statusDistribution: statusGroups.map((g) => ({ status: g.status, count: g._count })),
      categoryBreakdown: categoryRows.map((r) => ({ productType: r.productType, count: Number(r.count) })),
      revenueOverTime: revenueByDay.map((r) => ({ date: r.day.toISOString().slice(0, 10), amount: money(r.amount) })),
      paymentMethodBreakdown: { cash: money(cash), instapay: money(instapay) },
    };
  }
}
