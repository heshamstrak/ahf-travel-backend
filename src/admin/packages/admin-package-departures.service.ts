import { randomUUID } from "crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Errors } from "../../common/errors";
import { writeAudit } from "../../common/audit";
import { PrismaService } from "../../prisma/prisma.service";
import { guardedSetPackageDepartureCapacity } from "../common/guarded-capacity";
import { toAdminHttp } from "../common/admin-errors";
import { AdminActor, auditActorOf } from "../common/admin-actor";
import { CreatePackageDepartureDto, SetDepartureStatusDto, UpdatePackageDepartureDto } from "./admin-package-departures.dto";

@Injectable()
export class AdminPackageDeparturesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertPackage(packageId: string): Promise<void> {
    const row = await this.prisma.package.findUnique({ where: { id: packageId } });
    if (!row || row.deletedAt) throw Errors.notFound("Package");
  }

  async list(packageId: string) {
    await this.assertPackage(packageId);
    return this.prisma.packageDeparture.findMany({ where: { packageId }, orderBy: { startsOn: "asc" } });
  }

  async get(packageId: string, departureId: string) {
    await this.assertPackage(packageId);
    const row = await this.prisma.packageDeparture.findFirst({ where: { id: departureId, packageId } });
    if (!row) throw Errors.notFound("Package departure");
    return row;
  }

  async create(packageId: string, dto: CreatePackageDepartureDto, actor: AdminActor) {
    await this.assertPackage(packageId);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.packageDeparture.create({
        data: {
          id: randomUUID(),
          packageId,
          startsOn: new Date(`${dto.startsOn}T00:00:00Z`),
          capacity: dto.capacity,
          priceOverride: dto.priceOverride ?? null,
          overrideCurrency: dto.overrideCurrency?.toUpperCase() ?? null,
          status: "OPEN",
        },
      });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "package_departure.created", aggregateType: "PackageDeparture", aggregateId: row.id, after: { packageId, startsOn: dto.startsOn } });
      return row;
    });
  }

  async update(packageId: string, departureId: string, dto: UpdatePackageDepartureDto, actor: AdminActor) {
    await this.get(packageId, departureId);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.packageDeparture.update({
        where: { id: departureId },
        data: {
          ...(dto.startsOn !== undefined ? { startsOn: new Date(`${dto.startsOn}T00:00:00Z`) } : {}),
          ...(dto.priceOverride !== undefined ? { priceOverride: dto.priceOverride } : {}),
          ...(dto.overrideCurrency !== undefined ? { overrideCurrency: dto.overrideCurrency.toUpperCase() } : {}),
        },
      });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "package_departure.updated", aggregateType: "PackageDeparture", aggregateId: departureId, after: dto as unknown as Prisma.InputJsonValue });
      return row;
    });
  }

  async setCapacity(packageId: string, departureId: string, capacity: number, actor: AdminActor) {
    await this.get(packageId, departureId);
    try {
      await this.prisma.$transaction(async (tx) => {
        await guardedSetPackageDepartureCapacity(tx, departureId, capacity);
        await writeAudit(tx, { actor: auditActorOf(actor), action: "package_departure.capacity_set", aggregateType: "PackageDeparture", aggregateId: departureId, after: { capacity } });
      });
    } catch (error) {
      throw toAdminHttp(error);
    }
    return this.get(packageId, departureId);
  }

  async setStatus(packageId: string, departureId: string, dto: SetDepartureStatusDto, actor: AdminActor) {
    await this.get(packageId, departureId);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.packageDeparture.update({ where: { id: departureId }, data: { status: dto.status } });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "package_departure.status_changed", aggregateType: "PackageDeparture", aggregateId: departureId, after: { status: dto.status } });
      return row;
    });
  }
}
