import { randomUUID } from "crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Errors } from "../../common/errors";
import { writeAudit } from "../../common/audit";
import { PrismaService } from "../../prisma/prisma.service";
import { pageMeta } from "../../catalog/common/query";
import { AdminActor, auditActorOf } from "../common/admin-actor";
import { ContentStatusCode } from "../common/set-status.dto";
import { CreateLocationDto, ListLocationsQuery, UpdateLocationDto } from "./admin-locations.dto";

@Injectable()
export class AdminLocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListLocationsQuery) {
    const where: Prisma.LocationWhereInput = {
      deletedAt: null,
      ...(query.destinationId ? { destinationId: query.destinationId } : {}),
      ...(query.type ? { type: query.type } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.location.findMany({ where, orderBy: [{ name: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.location.count({ where }),
    ]);
    return { items, meta: pageMeta(query.page, query.pageSize, total) };
  }

  async get(id: string) {
    const row = await this.prisma.location.findUnique({ where: { id } });
    if (!row || row.deletedAt) throw Errors.notFound("Location");
    return row;
  }

  async create(dto: CreateLocationDto, actor: AdminActor) {
    const destination = await this.prisma.destination.findUnique({ where: { id: dto.destinationId } });
    if (!destination || destination.deletedAt) throw Errors.notFound("Destination");
    if (dto.code) {
      const existing = await this.prisma.location.findUnique({ where: { code: dto.code } });
      if (existing) throw Errors.conflict("CODE_TAKEN", "This code is already in use");
    }
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.location.create({
        data: {
          id: randomUUID(),
          type: dto.type,
          code: dto.code ?? null,
          name: dto.name,
          destinationId: dto.destinationId,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "location.created", aggregateType: "Location", aggregateId: row.id, after: { name: row.name } });
      return row;
    });
  }

  async update(id: string, dto: UpdateLocationDto, actor: AdminActor) {
    await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.location.update({ where: { id }, data: { ...dto, updatedById: actor.id } });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "location.updated", aggregateType: "Location", aggregateId: id, after: dto as unknown as Prisma.InputJsonValue });
      return row;
    });
  }

  async setStatus(id: string, status: ContentStatusCode, actor: AdminActor) {
    await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.location.update({ where: { id }, data: { status, updatedById: actor.id } });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "location.status_changed", aggregateType: "Location", aggregateId: id, after: { status } });
      return row;
    });
  }

  async remove(id: string, actor: AdminActor): Promise<void> {
    await this.get(id);
    const [carInventory, transferRoutes, bookingItems] = await Promise.all([
      this.prisma.carInventory.count({ where: { locationId: id } }),
      this.prisma.transferRate.count({ where: { OR: [{ originLocationId: id }, { destinationLocationId: id }], isActive: true } }),
      this.prisma.bookingItem.count({ where: { pickupLocationId: id } }),
    ]);
    if (carInventory + transferRoutes + bookingItems > 0) {
      throw Errors.conflict("LOCATION_IN_USE", "This location still has inventory, transfer routes or bookings referencing it");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.location.update({ where: { id }, data: { deletedAt: new Date(), status: "ARCHIVED", updatedById: actor.id } });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "location.deleted", aggregateType: "Location", aggregateId: id, after: {} });
    });
  }
}
