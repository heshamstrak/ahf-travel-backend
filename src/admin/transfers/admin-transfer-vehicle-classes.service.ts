import { randomUUID } from "crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Errors } from "../../common/errors";
import { writeAudit } from "../../common/audit";
import { PrismaService } from "../../prisma/prisma.service";
import { AdminActor, auditActorOf } from "../common/admin-actor";
import { CreateVehicleClassDto, UpdateVehicleClassDto } from "./admin-transfer-vehicle-classes.dto";

@Injectable()
export class AdminTransferVehicleClassesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.transferVehicleClass.findMany({ orderBy: { name: "asc" } });
  }

  async get(id: string) {
    const row = await this.prisma.transferVehicleClass.findUnique({ where: { id } });
    if (!row) throw Errors.notFound("Vehicle class");
    return row;
  }

  async create(dto: CreateVehicleClassDto, actor: AdminActor) {
    const existing = await this.prisma.transferVehicleClass.findUnique({ where: { code: dto.code } });
    if (existing) throw Errors.conflict("CODE_TAKEN", "A vehicle class with this code already exists");
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.transferVehicleClass.create({
        data: {
          id: randomUUID(),
          code: dto.code,
          name: dto.name,
          passengersMax: dto.passengersMax,
          luggageMax: dto.luggageMax,
          features: dto.features ?? [],
          isActive: true,
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "vehicle_class.created", aggregateType: "TransferVehicleClass", aggregateId: row.id, after: { code: row.code } });
      return row;
    });
  }

  async update(id: string, dto: UpdateVehicleClassDto, actor: AdminActor) {
    await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.transferVehicleClass.update({ where: { id }, data: { ...dto, updatedById: actor.id } });
      await writeAudit(tx, {
        actor: auditActorOf(actor),
        action: "vehicle_class.updated",
        aggregateType: "TransferVehicleClass",
        aggregateId: id,
        after: dto as unknown as Prisma.InputJsonValue,
      });
      return row;
    });
  }
}
