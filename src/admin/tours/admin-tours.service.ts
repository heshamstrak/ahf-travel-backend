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
import { CreateTourDto, UpdateTourDto } from "./admin-tours.dto";

@Injectable()
export class AdminToursService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaReader,
  ) {}

  async list(query: PageQueryDto) {
    const where: Prisma.TourWhereInput = { deletedAt: null };
    const now = new Date();
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.tour.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { destination: { select: { name: true } }, _count: { select: { sessions: { where: { startsAt: { gt: now }, status: "OPEN" } } } } },
      }),
      this.prisma.tour.count({ where }),
    ]);
    const covers = await this.media.coversByOwner(
      "TOUR",
      rows.map((r) => r.id),
    );
    const items = rows.map((r) => ({ ...r, destinationName: r.destination.name, upcomingSessionCount: r._count.sessions, cover: covers.get(r.id) ?? null }));
    return { items, meta: pageMeta(query.page, query.pageSize, total) };
  }

  async get(id: string) {
    const row = await this.prisma.tour.findUnique({ where: { id }, include: { sessions: { orderBy: { startsAt: "asc" } } } });
    if (!row || row.deletedAt) throw Errors.notFound("Tour");
    return row;
  }

  async create(dto: CreateTourDto, actor: AdminActor) {
    const [destination, policy] = await Promise.all([
      this.prisma.destination.findUnique({ where: { id: dto.destinationId } }),
      this.prisma.cancellationPolicy.findUnique({ where: { id: dto.cancellationPolicyId } }),
    ]);
    if (!destination || destination.deletedAt) throw Errors.notFound("Destination");
    if (!policy) throw Errors.notFound("Cancellation policy");
    const existing = await this.prisma.tour.findUnique({ where: { slug: dto.slug } });
    if (existing) throw Errors.conflict("SLUG_TAKEN", "This slug is already in use");

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.tour.create({
        data: {
          id: randomUUID(),
          slug: dto.slug,
          title: dto.title,
          category: dto.category,
          destinationId: dto.destinationId,
          meetingPoint: dto.meetingPoint,
          durationMinutes: dto.durationMinutes,
          maxGroupSize: dto.maxGroupSize,
          languages: dto.languages ?? [],
          currency: dto.currency.toUpperCase(),
          pricePerPerson: dto.pricePerPerson,
          overview: dto.overview,
          highlights: dto.highlights ?? [],
          included: dto.included ?? [],
          excluded: dto.excluded ?? [],
          importantInfo: dto.importantInfo ?? [],
          itinerary: (dto.itinerary ?? []) as unknown as Prisma.InputJsonValue,
          cancellationPolicyId: dto.cancellationPolicyId,
          status: "DRAFT",
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "tour.created", aggregateType: "Tour", aggregateId: row.id, after: { slug: row.slug } });
      return row;
    });
  }

  async update(id: string, dto: UpdateTourDto, actor: AdminActor) {
    await this.get(id);
    if (dto.cancellationPolicyId) {
      const policy = await this.prisma.cancellationPolicy.findUnique({ where: { id: dto.cancellationPolicyId } });
      if (!policy) throw Errors.notFound("Cancellation policy");
    }
    const { itinerary, ...rest } = dto;
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.tour.update({
        where: { id },
        data: { ...rest, ...(itinerary !== undefined ? { itinerary: itinerary as unknown as Prisma.InputJsonValue } : {}), updatedById: actor.id },
      });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "tour.updated", aggregateType: "Tour", aggregateId: id, after: dto as unknown as Prisma.InputJsonValue });
      return row;
    });
  }

  async setStatus(id: string, status: ContentStatusCode, actor: AdminActor) {
    await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.tour.update({ where: { id }, data: { status, updatedById: actor.id } });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "tour.status_changed", aggregateType: "Tour", aggregateId: id, after: { status } });
      return row;
    });
  }

  async remove(id: string, actor: AdminActor): Promise<void> {
    await this.get(id);
    const activeBookings = await this.prisma.bookingItem.count({ where: { tourId: id, status: { in: ["HELD", "CONFIRMED"] } } });
    if (activeBookings > 0) throw Errors.conflict("TOUR_HAS_ACTIVE_BOOKINGS", "This tour still has held or confirmed bookings");
    await this.prisma.$transaction(async (tx) => {
      await tx.tour.update({ where: { id }, data: { deletedAt: new Date(), status: "ARCHIVED", updatedById: actor.id } });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "tour.deleted", aggregateType: "Tour", aggregateId: id, after: {} });
    });
  }
}
