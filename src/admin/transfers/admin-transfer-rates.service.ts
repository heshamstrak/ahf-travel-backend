import { randomUUID } from "crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Errors } from "../../common/errors";
import { writeAudit } from "../../common/audit";
import { PrismaService } from "../../prisma/prisma.service";
import { PageQueryDto, pageMeta } from "../../catalog/common/query";
import { AdminActor, auditActorOf } from "../common/admin-actor";
import { CreateTransferRateDto, UpdateTransferRateDto } from "./admin-transfer-rates.dto";

@Injectable()
export class AdminTransferRatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PageQueryDto) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.transferRate.findMany({
        orderBy: { validFrom: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { origin: true, destination: true, vehicleClass: true },
      }),
      this.prisma.transferRate.count(),
    ]);
    return { items, meta: pageMeta(query.page, query.pageSize, total) };
  }

  async get(id: string) {
    const row = await this.prisma.transferRate.findUnique({ where: { id }, include: { origin: true, destination: true, vehicleClass: true } });
    if (!row) throw Errors.notFound("Transfer rate");
    return row;
  }

  async create(dto: CreateTransferRateDto, actor: AdminActor) {
    if (dto.originLocationId === dto.destinationLocationId) {
      throw Errors.conflict("VALIDATION_FAILED", "Origin and destination must be different locations");
    }
    const [origin, destination, vehicleClass] = await Promise.all([
      this.prisma.location.findUnique({ where: { id: dto.originLocationId } }),
      this.prisma.location.findUnique({ where: { id: dto.destinationLocationId } }),
      this.prisma.transferVehicleClass.findUnique({ where: { id: dto.vehicleClassId } }),
    ]);
    if (!origin || origin.deletedAt) throw Errors.notFound("Origin location");
    if (!destination || destination.deletedAt) throw Errors.notFound("Destination location");
    if (!vehicleClass) throw Errors.notFound("Vehicle class");

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.transferRate.create({
        data: {
          id: randomUUID(),
          originLocationId: dto.originLocationId,
          destinationLocationId: dto.destinationLocationId,
          vehicleClassId: dto.vehicleClassId,
          amount: dto.amount,
          currency: dto.currency.toUpperCase(),
          durationMinutes: dto.durationMinutes,
          // Admin-entered rates are real business data, never a seeded development placeholder.
          isDevPlaceholder: false,
          validFrom: new Date(`${dto.validFrom}T00:00:00Z`),
          validTo: dto.validTo ? new Date(`${dto.validTo}T00:00:00Z`) : null,
          isActive: true,
        },
      });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "transfer_rate.created", aggregateType: "TransferRate", aggregateId: row.id, after: { amount: dto.amount, currency: row.currency } });
      return row;
    });
  }

  /** Changing the price of an existing rate is always a distinct, explicit admin action (this
   *  endpoint), never an automatic side effect of anything else. Existing quotes keep their own
   *  immutable price snapshot regardless. */
  async update(id: string, dto: UpdateTransferRateDto, actor: AdminActor) {
    await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.transferRate.update({
        where: { id },
        data: {
          ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
          ...(dto.durationMinutes !== undefined ? { durationMinutes: dto.durationMinutes } : {}),
          ...(dto.validTo !== undefined ? { validTo: new Date(`${dto.validTo}T00:00:00Z`) } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          version: { increment: 1 },
        },
      });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "transfer_rate.updated", aggregateType: "TransferRate", aggregateId: id, after: dto as unknown as Prisma.InputJsonValue });
      return row;
    });
  }
}
