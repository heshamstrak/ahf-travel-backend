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
import { CreateCarModelDto, UpdateCarModelDto } from "./admin-cars.dto";

@Injectable()
export class AdminCarsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaReader,
  ) {}

  async list(query: PageQueryDto) {
    const where: Prisma.CarModelWhereInput = { deletedAt: null };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.carModel.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.carModel.count({ where }),
    ]);
    const covers = await this.media.coversByOwner(
      "CAR_MODEL",
      rows.map((r) => r.id),
    );
    const items = rows.map((r) => ({ ...r, cover: covers.get(r.id) ?? null }));
    return { items, meta: pageMeta(query.page, query.pageSize, total) };
  }

  async get(id: string) {
    const row = await this.prisma.carModel.findUnique({ where: { id } });
    if (!row || row.deletedAt) throw Errors.notFound("Car model");
    return row;
  }

  async create(dto: CreateCarModelDto, actor: AdminActor) {
    const policy = await this.prisma.cancellationPolicy.findUnique({ where: { id: dto.cancellationPolicyId } });
    if (!policy) throw Errors.notFound("Cancellation policy");
    const existing = await this.prisma.carModel.findUnique({ where: { slug: dto.slug } });
    if (existing) throw Errors.conflict("SLUG_TAKEN", "This slug is already in use");

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.carModel.create({
        data: {
          id: randomUUID(),
          slug: dto.slug,
          brand: dto.brand,
          name: dto.name,
          category: dto.category,
          transmission: dto.transmission,
          hasAirConditioning: dto.hasAirConditioning ?? true,
          passengers: dto.passengers,
          bags: dto.bags,
          doors: dto.doors,
          includedKmPerDay: dto.includedKmPerDay,
          fuelPolicy: dto.fuelPolicy ?? "FULL_TO_FULL",
          minDriverAge: dto.minDriverAge,
          currency: dto.currency.toUpperCase(),
          pricePerDay: dto.pricePerDay,
          depositAmount: dto.depositAmount,
          coverage: dto.coverage ?? [],
          rentalConditions: dto.rentalConditions ?? [],
          pickupNotes: dto.pickupNotes ?? null,
          cancellationPolicyId: dto.cancellationPolicyId,
          status: "DRAFT",
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "car_model.created", aggregateType: "CarModel", aggregateId: row.id, after: { slug: row.slug } });
      return row;
    });
  }

  async update(id: string, dto: UpdateCarModelDto, actor: AdminActor) {
    await this.get(id);
    if (dto.cancellationPolicyId) {
      const policy = await this.prisma.cancellationPolicy.findUnique({ where: { id: dto.cancellationPolicyId } });
      if (!policy) throw Errors.notFound("Cancellation policy");
    }
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.carModel.update({ where: { id }, data: { ...dto, updatedById: actor.id } });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "car_model.updated", aggregateType: "CarModel", aggregateId: id, after: dto as unknown as Prisma.InputJsonValue });
      return row;
    });
  }

  async setStatus(id: string, status: ContentStatusCode, actor: AdminActor) {
    await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.carModel.update({ where: { id }, data: { status, updatedById: actor.id } });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "car_model.status_changed", aggregateType: "CarModel", aggregateId: id, after: { status } });
      return row;
    });
  }

  async remove(id: string, actor: AdminActor): Promise<void> {
    await this.get(id);
    const activeBookings = await this.prisma.bookingItem.count({ where: { carModelId: id, status: { in: ["HELD", "CONFIRMED"] } } });
    if (activeBookings > 0) throw Errors.conflict("CAR_HAS_ACTIVE_BOOKINGS", "This car model still has held or confirmed bookings");
    await this.prisma.$transaction(async (tx) => {
      await tx.carModel.update({ where: { id }, data: { deletedAt: new Date(), status: "ARCHIVED", updatedById: actor.id } });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "car_model.deleted", aggregateType: "CarModel", aggregateId: id, after: {} });
    });
  }
}
