import { randomUUID } from "crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Errors } from "../../common/errors";
import { writeAudit } from "../../common/audit";
import { PrismaService } from "../../prisma/prisma.service";
import { PageQueryDto, pageMeta } from "../../catalog/common/query";
import { MediaReader } from "../../catalog/common/media";
import { AdminActor, auditActorOf } from "../common/admin-actor";
import { ContentStatusCode } from "../common/set-status.dto";
import { CreatePackageDto, UpdatePackageDto } from "./admin-packages.dto";

@Injectable()
export class AdminPackagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaReader,
  ) {}

  async list(query: PageQueryDto) {
    const where: Prisma.PackageWhereInput = { deletedAt: null };
    const now = new Date();
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.package.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { destinations: true, _count: { select: { departures: { where: { startsOn: { gt: now }, status: "OPEN" } } } } },
      }),
      this.prisma.package.count({ where }),
    ]);
    const covers = await this.media.coversByOwner(
      "PACKAGE",
      rows.map((r) => r.id),
    );
    const items = rows.map((r) => ({ ...r, upcomingDepartureCount: r._count.departures, cover: covers.get(r.id) ?? null }));
    return { items, meta: pageMeta(query.page, query.pageSize, total) };
  }

  async get(id: string) {
    const row = await this.prisma.package.findUnique({ where: { id }, include: { destinations: true, departures: { orderBy: { startsOn: "asc" } } } });
    if (!row || row.deletedAt) throw Errors.notFound("Package");
    return row;
  }

  async create(dto: CreatePackageDto, actor: AdminActor) {
    const minTravellers = dto.minTravellers ?? 1;
    if (minTravellers > dto.maxTravellers) throw Errors.conflict("VALIDATION_FAILED", "minTravellers cannot exceed maxTravellers");
    const [policy, destinations] = await Promise.all([
      this.prisma.cancellationPolicy.findUnique({ where: { id: dto.cancellationPolicyId } }),
      this.prisma.destination.findMany({ where: { id: { in: dto.destinationIds }, deletedAt: null } }),
    ]);
    if (!policy) throw Errors.notFound("Cancellation policy");
    if (destinations.length !== dto.destinationIds.length) throw Errors.notFound("Destination");
    const existing = await this.prisma.package.findUnique({ where: { slug: dto.slug } });
    if (existing) throw Errors.conflict("SLUG_TAKEN", "This slug is already in use");

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.package.create({
        data: {
          id: randomUUID(),
          slug: dto.slug,
          title: dto.title,
          overview: dto.overview,
          durationNights: dto.durationNights,
          durationDays: dto.durationDays,
          budgetTier: dto.budgetTier,
          pricingBasis: dto.pricingBasis,
          currency: dto.currency.toUpperCase(),
          basePrice: dto.basePrice,
          singleSupplement: dto.singleSupplement ?? null,
          childPrice: dto.childPrice ?? null,
          extraPersonPrice: dto.extraPersonPrice ?? null,
          minTravellers,
          maxTravellers: dto.maxTravellers,
          cancellationPolicyId: dto.cancellationPolicyId,
          itinerary: dto.itinerary as unknown as Prisma.InputJsonValue,
          includes: dto.includes ?? {},
          included: dto.included ?? [],
          excluded: dto.excluded ?? [],
          status: "DRAFT",
          createdById: actor.id,
          updatedById: actor.id,
          destinations: { connect: dto.destinationIds.map((id) => ({ id })) },
        },
      });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "package.created", aggregateType: "Package", aggregateId: row.id, after: { slug: row.slug } });
      return row;
    });
  }

  async update(id: string, dto: UpdatePackageDto, actor: AdminActor) {
    const existing = await this.get(id);
    const minTravellers = dto.minTravellers ?? existing.minTravellers;
    const maxTravellers = dto.maxTravellers ?? existing.maxTravellers;
    if (minTravellers > maxTravellers) throw Errors.conflict("VALIDATION_FAILED", "minTravellers cannot exceed maxTravellers");
    if (dto.cancellationPolicyId) {
      const policy = await this.prisma.cancellationPolicy.findUnique({ where: { id: dto.cancellationPolicyId } });
      if (!policy) throw Errors.notFound("Cancellation policy");
    }
    if (dto.destinationIds) {
      const destinations = await this.prisma.destination.findMany({ where: { id: { in: dto.destinationIds }, deletedAt: null } });
      if (destinations.length !== dto.destinationIds.length) throw Errors.notFound("Destination");
    }
    const { itinerary, includes, destinationIds, ...rest } = dto;
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.package.update({
        where: { id },
        data: {
          ...rest,
          ...(itinerary !== undefined ? { itinerary: itinerary as unknown as Prisma.InputJsonValue } : {}),
          ...(includes !== undefined ? { includes: includes as Prisma.InputJsonValue } : {}),
          ...(destinationIds !== undefined ? { destinations: { set: destinationIds.map((did) => ({ id: did })) } } : {}),
          updatedById: actor.id,
        },
      });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "package.updated", aggregateType: "Package", aggregateId: id, after: dto as unknown as Prisma.InputJsonValue });
      return row;
    });
  }

  async setStatus(id: string, status: ContentStatusCode, actor: AdminActor) {
    await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.package.update({ where: { id }, data: { status, updatedById: actor.id } });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "package.status_changed", aggregateType: "Package", aggregateId: id, after: { status } });
      return row;
    });
  }

  async remove(id: string, actor: AdminActor): Promise<void> {
    await this.get(id);
    const activeBookings = await this.prisma.bookingItem.count({ where: { productType: "PACKAGE", packageDeparture: { packageId: id }, status: { in: ["HELD", "CONFIRMED"] } } });
    if (activeBookings > 0) throw Errors.conflict("PACKAGE_HAS_ACTIVE_BOOKINGS", "This package still has held or confirmed bookings");
    await this.prisma.$transaction(async (tx) => {
      await tx.package.update({ where: { id }, data: { deletedAt: new Date(), status: "ARCHIVED", updatedById: actor.id } });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "package.deleted", aggregateType: "Package", aggregateId: id, after: {} });
    });
  }
}
