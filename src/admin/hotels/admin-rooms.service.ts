import { randomUUID } from "crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Errors } from "../../common/errors";
import { writeAudit } from "../../common/audit";
import { PrismaService } from "../../prisma/prisma.service";
import { pageMeta, todayUtc } from "../../catalog/common/query";
import { MediaReader } from "../../catalog/common/media";
import { AdminActor, auditActorOf } from "../common/admin-actor";
import { ContentStatusCode } from "../common/set-status.dto";
import { CreateRoomDto, ListAllRoomsQuery, UpdateRoomDto } from "./admin-rooms.dto";

@Injectable()
export class AdminRoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaReader,
  ) {}

  private async assertHotel(hotelId: string): Promise<void> {
    const hotel = await this.prisma.hotel.findUnique({ where: { id: hotelId } });
    if (!hotel || hotel.deletedAt) throw Errors.notFound("Hotel");
  }

  /** The standalone, cross-hotel "Hotel Rooms" table: every room, with its hotel's name, rate
   *  plan count, today's inventory snapshot and cover image, so the admin never has to open each
   *  hotel individually just to see what rooms exist. */
  async listAll(query: ListAllRoomsQuery) {
    const where: Prisma.RoomWhereInput = {
      deletedAt: null,
      ...(query.hotelId ? { hotelId: query.hotelId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              { code: { contains: query.q, mode: "insensitive" } },
              { hotel: { name: { contains: query.q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.room.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          hotel: { select: { id: true, name: true } },
          _count: { select: { ratePlans: { where: { status: { not: "ARCHIVED" } } } } },
          inventory: { where: { date: todayUtc() }, take: 1 },
        },
      }),
      this.prisma.room.count({ where }),
    ]);
    const covers = await this.media.coversByOwner(
      "ROOM",
      rows.map((r) => r.id),
    );
    const items = rows.map((r) => {
      const todayInventory = r.inventory[0];
      return {
        id: r.id,
        hotelId: r.hotelId,
        hotelName: r.hotel.name,
        code: r.code,
        name: r.name,
        bedType: r.bedType,
        maxAdults: r.maxAdults,
        maxChildren: r.maxChildren,
        ratePlanCount: r._count.ratePlans,
        status: r.status,
        updatedAt: r.updatedAt,
        cover: covers.get(r.id) ?? null,
        availabilityToday: todayInventory
          ? { total: todayInventory.totalUnits, held: todayInventory.heldUnits, sold: todayInventory.soldUnits, free: todayInventory.totalUnits - todayInventory.heldUnits - todayInventory.soldUnits - todayInventory.blockedUnits }
          : null,
      };
    });
    return { items, meta: pageMeta(query.page, query.pageSize, total) };
  }

  async list(hotelId: string) {
    await this.assertHotel(hotelId);
    return this.prisma.room.findMany({ where: { hotelId, deletedAt: null }, orderBy: { code: "asc" }, include: { ratePlans: { where: { status: { not: "ARCHIVED" } } } } });
  }

  async get(hotelId: string, roomId: string) {
    await this.assertHotel(hotelId);
    const row = await this.prisma.room.findFirst({ where: { id: roomId, hotelId }, include: { ratePlans: true } });
    if (!row || row.deletedAt) throw Errors.notFound("Room");
    return row;
  }

  async create(hotelId: string, dto: CreateRoomDto, actor: AdminActor) {
    await this.assertHotel(hotelId);
    const existing = await this.prisma.room.findUnique({ where: { hotelId_code: { hotelId, code: dto.code } } });
    if (existing) throw Errors.conflict("CODE_TAKEN", "This room code is already in use at this hotel");
    if (dto.baseOccupancy > dto.maxAdults) {
      throw Errors.conflict("VALIDATION_FAILED", "Base occupancy cannot exceed the maximum number of adults");
    }
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.room.create({
        data: {
          id: randomUUID(),
          hotelId,
          code: dto.code,
          name: dto.name,
          bedType: dto.bedType,
          baseOccupancy: dto.baseOccupancy,
          maxAdults: dto.maxAdults,
          maxChildren: dto.maxChildren ?? 0,
          sizeSqm: dto.sizeSqm ?? null,
          features: dto.features ?? [],
          status: "DRAFT",
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "room.created", aggregateType: "Room", aggregateId: row.id, after: { hotelId, code: row.code } });
      return row;
    });
  }

  async update(hotelId: string, roomId: string, dto: UpdateRoomDto, actor: AdminActor) {
    const existing = await this.get(hotelId, roomId);
    const baseOccupancy = dto.baseOccupancy ?? existing.baseOccupancy;
    const maxAdults = dto.maxAdults ?? existing.maxAdults;
    if (baseOccupancy > maxAdults) {
      throw Errors.conflict("VALIDATION_FAILED", "Base occupancy cannot exceed the maximum number of adults");
    }
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.room.update({ where: { id: roomId }, data: { ...dto, updatedById: actor.id } });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "room.updated", aggregateType: "Room", aggregateId: roomId, after: dto as unknown as Prisma.InputJsonValue });
      return row;
    });
  }

  async setStatus(hotelId: string, roomId: string, status: ContentStatusCode, actor: AdminActor) {
    await this.get(hotelId, roomId);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.room.update({ where: { id: roomId }, data: { status, updatedById: actor.id } });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "room.status_changed", aggregateType: "Room", aggregateId: roomId, after: { status } });
      return row;
    });
  }

  async remove(hotelId: string, roomId: string, actor: AdminActor): Promise<void> {
    await this.get(hotelId, roomId);
    const activeBookings = await this.prisma.bookingItem.count({ where: { roomId, status: { in: ["HELD", "CONFIRMED"] } } });
    if (activeBookings > 0) throw Errors.conflict("ROOM_HAS_ACTIVE_BOOKINGS", "This room still has held or confirmed bookings");
    await this.prisma.$transaction(async (tx) => {
      await tx.room.update({ where: { id: roomId }, data: { deletedAt: new Date(), status: "ARCHIVED", updatedById: actor.id } });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "room.deleted", aggregateType: "Room", aggregateId: roomId, after: {} });
    });
  }
}
