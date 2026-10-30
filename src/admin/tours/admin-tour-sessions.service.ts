import { randomUUID } from "crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Errors } from "../../common/errors";
import { writeAudit } from "../../common/audit";
import { PrismaService } from "../../prisma/prisma.service";
import { pageMeta } from "../../catalog/common/query";
import { guardedSetTourSessionCapacity } from "../common/guarded-capacity";
import { toAdminHttp } from "../common/admin-errors";
import { AdminActor, auditActorOf } from "../common/admin-actor";
import { CreateTourSessionDto, ListAllTourSessionsQuery, SetSessionStatusDto, UpdateTourSessionDto } from "./admin-tour-sessions.dto";

@Injectable()
export class AdminTourSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertTour(tourId: string): Promise<void> {
    const tour = await this.prisma.tour.findUnique({ where: { id: tourId } });
    if (!tour || tour.deletedAt) throw Errors.notFound("Tour");
  }

  /** The standalone, cross-tour "Tour Sessions" table: every session, with its tour's title and a
   *  remaining-capacity figure, so the admin can manage departures without opening each tour. */
  async listAll(query: ListAllTourSessionsQuery) {
    const where: Prisma.TourSessionWhereInput = {
      ...(query.tourId ? { tourId: query.tourId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            startsAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.q ? { tour: { title: { contains: query.q, mode: "insensitive" } } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.tourSession.findMany({
        where,
        orderBy: { startsAt: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { tour: { select: { id: true, title: true } } },
      }),
      this.prisma.tourSession.count({ where }),
    ]);
    const items = rows.map((r) => ({
      id: r.id,
      tourId: r.tourId,
      tourTitle: r.tour.title,
      startsAt: r.startsAt,
      capacity: r.capacity,
      heldUnits: r.heldUnits,
      bookedUnits: r.bookedUnits,
      remaining: r.capacity - r.heldUnits - r.bookedUnits,
      status: r.status,
    }));
    return { items, meta: pageMeta(query.page, query.pageSize, total) };
  }

  async list(tourId: string) {
    await this.assertTour(tourId);
    return this.prisma.tourSession.findMany({ where: { tourId }, orderBy: { startsAt: "asc" } });
  }

  async get(tourId: string, sessionId: string) {
    await this.assertTour(tourId);
    const row = await this.prisma.tourSession.findFirst({ where: { id: sessionId, tourId } });
    if (!row) throw Errors.notFound("Tour session");
    return row;
  }

  async create(tourId: string, dto: CreateTourSessionDto, actor: AdminActor) {
    await this.assertTour(tourId);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.tourSession.create({
        data: {
          id: randomUUID(),
          tourId,
          startsAt: new Date(dto.startsAt),
          capacity: dto.capacity,
          priceOverride: dto.priceOverride ?? null,
          overrideCurrency: dto.overrideCurrency?.toUpperCase() ?? null,
          status: "OPEN",
        },
      });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "tour_session.created", aggregateType: "TourSession", aggregateId: row.id, after: { tourId, startsAt: dto.startsAt } });
      return row;
    });
  }

  async update(tourId: string, sessionId: string, dto: UpdateTourSessionDto, actor: AdminActor) {
    await this.get(tourId, sessionId);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.tourSession.update({
        where: { id: sessionId },
        data: {
          ...(dto.startsAt !== undefined ? { startsAt: new Date(dto.startsAt) } : {}),
          ...(dto.priceOverride !== undefined ? { priceOverride: dto.priceOverride } : {}),
          ...(dto.overrideCurrency !== undefined ? { overrideCurrency: dto.overrideCurrency.toUpperCase() } : {}),
        },
      });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "tour_session.updated", aggregateType: "TourSession", aggregateId: sessionId, after: dto as unknown as Prisma.InputJsonValue });
      return row;
    });
  }

  /** Never reduces capacity below what is already held or booked — see guarded-capacity.ts. */
  async setCapacity(tourId: string, sessionId: string, capacity: number, actor: AdminActor) {
    await this.get(tourId, sessionId);
    try {
      await this.prisma.$transaction(async (tx) => {
        await guardedSetTourSessionCapacity(tx, sessionId, capacity);
        await writeAudit(tx, { actor: auditActorOf(actor), action: "tour_session.capacity_set", aggregateType: "TourSession", aggregateId: sessionId, after: { capacity } });
      });
    } catch (error) {
      throw toAdminHttp(error);
    }
    return this.get(tourId, sessionId);
  }

  async setStatus(tourId: string, sessionId: string, dto: SetSessionStatusDto, actor: AdminActor) {
    await this.get(tourId, sessionId);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.tourSession.update({ where: { id: sessionId }, data: { status: dto.status } });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "tour_session.status_changed", aggregateType: "TourSession", aggregateId: sessionId, after: { status: dto.status } });
      return row;
    });
  }
}
