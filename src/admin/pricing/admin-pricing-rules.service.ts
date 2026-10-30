import { randomUUID } from "crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Errors, validationFailed } from "../../common/errors";
import { writeAudit } from "../../common/audit";
import { PrismaService } from "../../prisma/prisma.service";
import { pageMeta } from "../../catalog/common/query";
import { AdminActor, auditActorOf } from "../common/admin-actor";
import { CreatePricingRuleDto, ListPricingRulesQuery, UpdatePricingRuleDto } from "./admin-pricing-rules.dto";

/** Admin management of the tax/fee/surcharge/discount rules the live quote engine reads
 *  (src/quotes/quotes.repository.ts's `activeRules`) — this never duplicates that pricing logic,
 *  it only lets an admin maintain the PricingRule rows it already reads. */
@Injectable()
export class AdminPricingRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListPricingRulesQuery) {
    const where: Prisma.PricingRuleWhereInput = {
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.productType ? { productType: query.productType } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.pricingRule.findMany({
        where,
        orderBy: [{ priority: "desc" }, { code: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.pricingRule.count({ where }),
    ]);
    return { items, meta: pageMeta(query.page, query.pageSize, total) };
  }

  async get(id: string) {
    const row = await this.prisma.pricingRule.findUnique({ where: { id } });
    if (!row) throw Errors.notFound("Pricing rule");
    return row;
  }

  private assertAmountShape(percent?: number, flatAmount?: number, flatCurrency?: string): void {
    if (percent === undefined && flatAmount === undefined) {
      throw validationFailed([{ field: "percent", message: "either percent or flatAmount is required" }]);
    }
    if (flatAmount !== undefined && flatCurrency === undefined) {
      throw validationFailed([{ field: "flatCurrency", message: "is required when flatAmount is set" }]);
    }
  }

  async create(dto: CreatePricingRuleDto, actor: AdminActor) {
    this.assertAmountShape(dto.percent, dto.flatAmount, dto.flatCurrency);
    const existing = await this.prisma.pricingRule.findUnique({ where: { code: dto.code } });
    if (existing) throw Errors.conflict("CODE_TAKEN", "This code is already in use");
    if (dto.validTo && dto.validTo < dto.validFrom) {
      throw validationFailed([{ field: "validTo", message: "must be on or after validFrom" }]);
    }

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.pricingRule.create({
        data: {
          id: randomUUID(),
          code: dto.code,
          kind: dto.kind,
          label: dto.label,
          productType: dto.productType ?? null,
          percent: dto.percent ?? null,
          flatAmount: dto.flatAmount ?? null,
          flatCurrency: dto.flatAmount !== undefined ? dto.flatCurrency?.toUpperCase() : null,
          conditions: (dto.conditions ?? undefined) as Prisma.InputJsonValue,
          priority: dto.priority ?? 0,
          validFrom: new Date(dto.validFrom),
          validTo: dto.validTo ? new Date(dto.validTo) : null,
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "pricing_rule.created", aggregateType: "PricingRule", aggregateId: row.id, after: { code: row.code, kind: row.kind } });
      return row;
    });
  }

  async update(id: string, dto: UpdatePricingRuleDto, actor: AdminActor) {
    const existing = await this.get(id);
    const percent = dto.percent !== undefined ? dto.percent : existing.percent !== null ? Number(existing.percent) : undefined;
    const flatAmount = dto.flatAmount !== undefined ? dto.flatAmount : existing.flatAmount !== null ? Number(existing.flatAmount) : undefined;
    const flatCurrency = dto.flatCurrency ?? existing.flatCurrency ?? undefined;
    this.assertAmountShape(percent, flatAmount, flatCurrency);
    const validFrom = dto.validFrom ?? existing.validFrom.toISOString().slice(0, 10);
    const validTo = dto.validTo !== undefined ? dto.validTo : existing.validTo?.toISOString().slice(0, 10);
    if (validTo && validTo < validFrom) {
      throw validationFailed([{ field: "validTo", message: "must be on or after validFrom" }]);
    }

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.pricingRule.update({
        where: { id },
        data: {
          ...(dto.label !== undefined ? { label: dto.label } : {}),
          ...(dto.productType !== undefined ? { productType: dto.productType } : {}),
          ...(dto.percent !== undefined ? { percent: dto.percent } : {}),
          ...(dto.flatAmount !== undefined ? { flatAmount: dto.flatAmount } : {}),
          ...(dto.flatCurrency !== undefined ? { flatCurrency: dto.flatCurrency.toUpperCase() } : {}),
          ...(dto.conditions !== undefined ? { conditions: dto.conditions as Prisma.InputJsonValue } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.validFrom !== undefined ? { validFrom: new Date(dto.validFrom) } : {}),
          ...(dto.validTo !== undefined ? { validTo: new Date(dto.validTo) } : {}),
          updatedById: actor.id,
        },
      });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "pricing_rule.updated", aggregateType: "PricingRule", aggregateId: id, after: dto as unknown as Prisma.InputJsonValue });
      return row;
    });
  }

  async remove(id: string, actor: AdminActor): Promise<void> {
    await this.get(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.pricingRule.delete({ where: { id } });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "pricing_rule.deleted", aggregateType: "PricingRule", aggregateId: id, after: {} });
    });
  }
}
