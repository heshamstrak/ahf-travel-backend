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
import { CreateHotelDto, UpdateHotelDto } from "./admin-hotels.dto";

@Injectable()
export class AdminHotelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaReader,
  ) {}

  async list(query: PageQueryDto) {
    const where: Prisma.HotelWhereInput = { deletedAt: null };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.hotel.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { destination: { select: { name: true } }, _count: { select: { rooms: { where: { deletedAt: null } } } } },
      }),
      this.prisma.hotel.count({ where }),
    ]);
    const covers = await this.media.coversByOwner(
      "HOTEL",
      rows.map((r) => r.id),
    );
    const items = rows.map((r) => ({ ...r, destinationName: r.destination.name, roomCount: r._count.rooms, cover: covers.get(r.id) ?? null }));
    return { items, meta: pageMeta(query.page, query.pageSize, total) };
  }

  async get(id: string) {
    const row = await this.prisma.hotel.findUnique({ where: { id }, include: { rooms: { where: { deletedAt: null } } } });
    if (!row || row.deletedAt) throw Errors.notFound("Hotel");
    return row;
  }

  async create(dto: CreateHotelDto, actor: AdminActor) {
    const destination = await this.prisma.destination.findUnique({ where: { id: dto.destinationId } });
    if (!destination || destination.deletedAt) throw Errors.notFound("Destination");
    const existing = await this.prisma.hotel.findUnique({ where: { slug: dto.slug } });
    if (existing) throw Errors.conflict("SLUG_TAKEN", "This slug is already in use");

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.hotel.create({
        data: {
          id: randomUUID(),
          slug: dto.slug,
          name: dto.name,
          destinationId: dto.destinationId,
          propertyType: dto.propertyType,
          starRating: dto.starRating,
          addressLine: dto.addressLine,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          description: dto.description,
          checkInTime: dto.checkInTime,
          checkOutTime: dto.checkOutTime,
          amenities: dto.amenities ?? [],
          status: "DRAFT",
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "hotel.created", aggregateType: "Hotel", aggregateId: row.id, after: { slug: row.slug } });
      return row;
    });
  }

  async update(id: string, dto: UpdateHotelDto, actor: AdminActor) {
    await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.hotel.update({ where: { id }, data: { ...dto, updatedById: actor.id } });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "hotel.updated", aggregateType: "Hotel", aggregateId: id, after: dto as unknown as Prisma.InputJsonValue });
      return row;
    });
  }

  async setStatus(id: string, status: ContentStatusCode, actor: AdminActor) {
    await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.hotel.update({ where: { id }, data: { status, updatedById: actor.id } });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "hotel.status_changed", aggregateType: "Hotel", aggregateId: id, after: { status } });
      return row;
    });
  }

  async remove(id: string, actor: AdminActor): Promise<void> {
    await this.get(id);
    const activeBookings = await this.prisma.bookingItem.count({ where: { hotelId: id, status: { in: ["HELD", "CONFIRMED"] } } });
    if (activeBookings > 0) throw Errors.conflict("HOTEL_HAS_ACTIVE_BOOKINGS", "This hotel still has held or confirmed bookings");
    await this.prisma.$transaction(async (tx) => {
      await tx.hotel.update({ where: { id }, data: { deletedAt: new Date(), status: "ARCHIVED", updatedById: actor.id } });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "hotel.deleted", aggregateType: "Hotel", aggregateId: id, after: {} });
    });
  }
}
