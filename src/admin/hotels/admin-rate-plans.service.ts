import { randomUUID } from "crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Errors } from "../../common/errors";
import { writeAudit } from "../../common/audit";
import { PrismaService } from "../../prisma/prisma.service";
import { AdminActor, auditActorOf } from "../common/admin-actor";
import { ContentStatusCode } from "../common/set-status.dto";
import { CreateRatePlanDto, UpdateRatePlanDto } from "./admin-rate-plans.dto";

/**
 * Price edits here never touch an already-created Quote: Quote.lines/totals are an immutable
 * snapshot taken at quote time (enforced by a database trigger, Milestone 3), so changing a rate
 * plan's price only affects quotes priced after the change. No extra guard is needed for that
 * invariant — it already holds structurally.
 */
@Injectable()
export class AdminRatePlansService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertRoom(hotelId: string, roomId: string): Promise<void> {
    const room = await this.prisma.room.findFirst({ where: { id: roomId, hotelId } });
    if (!room || room.deletedAt) throw Errors.notFound("Room");
  }

  async list(hotelId: string, roomId: string) {
    await this.assertRoom(hotelId, roomId);
    return this.prisma.ratePlan.findMany({ where: { roomId }, orderBy: { code: "asc" } });
  }

  async get(hotelId: string, roomId: string, ratePlanId: string) {
    await this.assertRoom(hotelId, roomId);
    const row = await this.prisma.ratePlan.findFirst({ where: { id: ratePlanId, roomId } });
    if (!row) throw Errors.notFound("Rate plan");
    return row;
  }

  async create(hotelId: string, roomId: string, dto: CreateRatePlanDto, actor: AdminActor) {
    await this.assertRoom(hotelId, roomId);
    const policy = await this.prisma.cancellationPolicy.findUnique({ where: { id: dto.cancellationPolicyId } });
    if (!policy) throw Errors.notFound("Cancellation policy");
    const existing = await this.prisma.ratePlan.findUnique({ where: { roomId_code: { roomId, code: dto.code } } });
    if (existing) throw Errors.conflict("CODE_TAKEN", "This rate plan code is already in use for this room");

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.ratePlan.create({
        data: {
          id: randomUUID(),
          roomId,
          code: dto.code,
          name: dto.name,
          mealPlan: dto.mealPlan ?? "ROOM_ONLY",
          isRefundable: dto.isRefundable,
          cancellationPolicyId: dto.cancellationPolicyId,
          currency: dto.currency.toUpperCase(),
          basePricePerNight: dto.basePricePerNight,
          extraAdultPerNight: dto.extraAdultPerNight ?? null,
          extraChildPerNight: dto.extraChildPerNight ?? null,
          status: "DRAFT",
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "rate_plan.created", aggregateType: "RatePlan", aggregateId: row.id, after: { roomId, code: row.code } });
      return row;
    });
  }

  async update(hotelId: string, roomId: string, ratePlanId: string, dto: UpdateRatePlanDto, actor: AdminActor) {
    await this.get(hotelId, roomId, ratePlanId);
    if (dto.cancellationPolicyId) {
      const policy = await this.prisma.cancellationPolicy.findUnique({ where: { id: dto.cancellationPolicyId } });
      if (!policy) throw Errors.notFound("Cancellation policy");
    }
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.ratePlan.update({ where: { id: ratePlanId }, data: { ...dto, updatedById: actor.id } });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "rate_plan.updated", aggregateType: "RatePlan", aggregateId: ratePlanId, after: dto as unknown as Prisma.InputJsonValue });
      return row;
    });
  }

  async setStatus(hotelId: string, roomId: string, ratePlanId: string, status: ContentStatusCode, actor: AdminActor) {
    await this.get(hotelId, roomId, ratePlanId);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.ratePlan.update({ where: { id: ratePlanId }, data: { status, updatedById: actor.id } });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "rate_plan.status_changed", aggregateType: "RatePlan", aggregateId: ratePlanId, after: { status } });
      return row;
    });
  }
}
