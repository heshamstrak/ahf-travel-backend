import { randomUUID } from "crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Errors } from "../../common/errors";
import { writeAudit } from "../../common/audit";
import { PrismaService } from "../../prisma/prisma.service";
import { PageQueryDto, pageMeta } from "../../catalog/common/query";
import { AdminActor, auditActorOf } from "../common/admin-actor";
import { CreatePolicyDto, UpdatePolicyDto } from "./admin-policies.dto";

/** No delete endpoint: CancellationPolicy has no soft-delete column, and RatePlan/Tour/CarModel/
 *  Package all hold a required (non-nullable) foreign key to it, so the database's own foreign
 *  key constraint would refuse a hard delete of anything still in use anyway. Policies are
 *  foundational reference data; create new ones rather than retiring old ones. */
@Injectable()
export class AdminPoliciesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PageQueryDto) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.cancellationPolicy.findMany({ orderBy: { name: "asc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.cancellationPolicy.count(),
    ]);
    return { items, meta: pageMeta(query.page, query.pageSize, total) };
  }

  async get(id: string) {
    const row = await this.prisma.cancellationPolicy.findUnique({ where: { id } });
    if (!row) throw Errors.notFound("Cancellation policy");
    return row;
  }

  async create(dto: CreatePolicyDto, actor: AdminActor) {
    const existing = await this.prisma.cancellationPolicy.findUnique({ where: { code: dto.code } });
    if (existing) throw Errors.conflict("CODE_TAKEN", "This code is already in use");
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.cancellationPolicy.create({
        data: {
          id: randomUUID(),
          code: dto.code,
          name: dto.name,
          description: dto.description,
          rules: dto.rules as unknown as Prisma.InputJsonValue,
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "policy.created", aggregateType: "CancellationPolicy", aggregateId: row.id, after: { code: row.code } });
      return row;
    });
  }

  async update(id: string, dto: UpdatePolicyDto, actor: AdminActor) {
    await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.cancellationPolicy.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.rules !== undefined ? { rules: dto.rules as unknown as Prisma.InputJsonValue } : {}),
          updatedById: actor.id,
        },
      });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "policy.updated", aggregateType: "CancellationPolicy", aggregateId: id, after: dto as unknown as Prisma.InputJsonValue });
      return row;
    });
  }
}
