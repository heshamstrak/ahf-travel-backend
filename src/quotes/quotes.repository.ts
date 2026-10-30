import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { RuleSnapshot } from "../pricing/rules";

/**
 * Read-only catalogue and availability queries for pricing, plus quote persistence.
 * Nothing here mutates inventory. Availability is read and checked, never reserved (Milestone 4).
 */
@Injectable()
export class QuotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async settingValue(key: string): Promise<unknown> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    if (!row) throw new Error(`missing setting ${key}`);
    return row.value;
  }

  /** Rules valid today for the product, plus rules that apply to every product type. */
  async activeRules(productType: string, today: Date): Promise<RuleSnapshot[]> {
    const rows = await this.prisma.pricingRule.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ productType: null }, { productType: productType as never }] },
          { validFrom: { lte: today } },
          { OR: [{ validTo: null }, { validTo: { gte: today } }] },
        ],
      },
    });
    return rows.map((rule) => ({
      id: rule.id,
      code: rule.code,
      kind: rule.kind,
      label: rule.label,
      productType: rule.productType,
      percent: rule.percent?.toString() ?? null,
      flatAmount: rule.flatAmount?.toString() ?? null,
      flatCurrency: rule.flatCurrency,
      conditions: (rule.conditions as Record<string, unknown> | null) ?? null,
      priority: rule.priority,
      validFrom: rule.validFrom.toISOString().slice(0, 10),
      validTo: rule.validTo ? rule.validTo.toISOString().slice(0, 10) : null,
      version: rule.updatedAt.toISOString(),
    }));
  }

  /** A rate plan that is sellable right now: published rate, room, hotel and destination. */
  findSellableRatePlan(ratePlanId: string) {
    return this.prisma.ratePlan.findFirst({
      where: {
        id: ratePlanId,
        status: "PUBLISHED",
        room: {
          status: "PUBLISHED",
          deletedAt: null,
          hotel: { status: "PUBLISHED", deletedAt: null, destination: { status: "PUBLISHED", deletedAt: null } },
        },
      },
      include: {
        cancellationPolicy: { select: { code: true, name: true, description: true } },
        room: {
          select: {
            id: true,
            code: true,
            name: true,
            bedType: true,
            baseOccupancy: true,
            maxAdults: true,
            maxChildren: true,
            hotel: { select: { id: true, slug: true, name: true } },
          },
        },
      },
    });
  }

  /** Date-specific nightly prices for a stay: [from, to). */
  roomRateOverrides(ratePlanId: string, from: Date, to: Date) {
    return this.prisma.roomRate.findMany({
      where: { ratePlanId, date: { gte: from, lt: to } },
      select: { date: true, currency: true, pricePerNight: true },
    });
  }

  roomInventory(roomId: string, from: Date, to: Date) {
    return this.prisma.roomInventory.findMany({
      where: { roomId, date: { gte: from, lt: to } },
      select: { date: true, totalUnits: true, heldUnits: true, soldUnits: true, blockedUnits: true },
    });
  }

  /** A session that is open for sale. Visibility of the tour and its destination is checked here too. */
  findTourSession(sessionId: string) {
    return this.prisma.tourSession.findFirst({
      where: {
        id: sessionId,
        status: "OPEN",
        tour: { status: "PUBLISHED", deletedAt: null, destination: { status: "PUBLISHED", deletedAt: null } },
      },
      include: {
        tour: {
          select: {
            id: true,
            slug: true,
            title: true,
            currency: true,
            pricePerPerson: true,
            maxGroupSize: true,
            cancellationPolicy: { select: { code: true, name: true, description: true } },
          },
        },
      },
    });
  }

  findSellableCarModel(carModelId: string) {
    return this.prisma.carModel.findFirst({
      where: { id: carModelId, status: "PUBLISHED", deletedAt: null },
      include: { cancellationPolicy: { select: { code: true, name: true, description: true } } },
    });
  }

  findPickupLocation(locationId: string) {
    return this.prisma.location.findFirst({
      where: {
        id: locationId,
        status: "PUBLISHED",
        deletedAt: null,
        type: { in: ["AIRPORT", "CAR_BRANCH"] },
        destination: { status: "PUBLISHED", deletedAt: null },
      },
      select: { id: true, name: true, code: true, type: true },
    });
  }

  carInventory(carModelId: string, locationId: string, from: Date, to: Date) {
    return this.prisma.carInventory.findMany({
      where: { carModelId, locationId, date: { gte: from, lt: to } },
      select: { date: true, totalUnits: true, heldUnits: true, bookedUnits: true, blockedUnits: true },
    });
  }

  /** An active route whose validity window covers the requested date. Both ends must be published. */
  findTransferRate(transferRateId: string, date: Date) {
    return this.prisma.transferRate.findFirst({
      where: {
        id: transferRateId,
        isActive: true,
        validFrom: { lte: date },
        AND: [{ OR: [{ validTo: null }, { validTo: { gte: date } }] }],
        origin: { status: "PUBLISHED", deletedAt: null },
        destination: { status: "PUBLISHED", deletedAt: null },
        vehicleClass: { isActive: true },
      },
      include: {
        origin: { select: { id: true, name: true, code: true, type: true } },
        destination: { select: { id: true, name: true, code: true, type: true } },
        vehicleClass: { select: { id: true, code: true, name: true, passengersMax: true, luggageMax: true } },
      },
    });
  }

  transferCapacity(vehicleClassId: string, date: Date) {
    return this.prisma.transferCapacity.findFirst({
      where: { vehicleClassId, date },
      select: { totalUnits: true, heldUnits: true, bookedUnits: true },
    });
  }

  /** An open departure that has not started yet, of a published package. */
  findDeparture(departureId: string, today: Date) {
    return this.prisma.packageDeparture.findFirst({
      where: {
        id: departureId,
        status: "OPEN",
        startsOn: { gt: today },
        package: {
          status: "PUBLISHED",
          deletedAt: null,
          destinations: { some: { status: "PUBLISHED", deletedAt: null } },
        },
      },
      include: {
        package: {
          select: {
            id: true,
            slug: true,
            title: true,
            pricingBasis: true,
            currency: true,
            basePrice: true,
            singleSupplement: true,
            childPrice: true,
            extraPersonPrice: true,
            minTravellers: true,
            maxTravellers: true,
            cancellationPolicy: { select: { code: true, name: true, description: true } },
          },
        },
      },
    });
  }

  async exchangeRate(baseCurrency: string, quoteCurrency: string) {
    return this.prisma.exchangeRate.findUnique({
      where: { baseCurrency_quoteCurrency: { baseCurrency, quoteCurrency } },
      select: { rate: true, source: true, fetchedAt: true },
    });
  }

  createQuote(data: Prisma.QuoteUncheckedCreateInput) {
    return this.prisma.quote.create({ data });
  }

  findQuote(id: string) {
    return this.prisma.quote.findUnique({ where: { id } });
  }
}
