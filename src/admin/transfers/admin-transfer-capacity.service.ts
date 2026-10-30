import { Injectable } from "@nestjs/common";
import { Errors } from "../../common/errors";
import { writeAudit } from "../../common/audit";
import { PrismaService } from "../../prisma/prisma.service";
import { guardedSetTransferCapacityTotal } from "../common/guarded-capacity";
import { toAdminHttp } from "../common/admin-errors";
import { AdminActor, auditActorOf } from "../common/admin-actor";
import { datesBetween, MAX_RANGE_DAYS } from "../common/date-range";
import { SetTransferCapacityDto } from "./admin-transfer-capacity.dto";

@Injectable()
export class AdminTransferCapacityService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertVehicleClass(vehicleClassId: string): Promise<void> {
    const vc = await this.prisma.transferVehicleClass.findUnique({ where: { id: vehicleClassId } });
    if (!vc) throw Errors.notFound("Vehicle class");
  }

  async list(vehicleClassId: string, from: string, to: string) {
    await this.assertVehicleClass(vehicleClassId);
    return this.prisma.transferCapacity.findMany({
      where: { vehicleClassId, date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
      orderBy: { date: "asc" },
    });
  }

  async setRange(vehicleClassId: string, dto: SetTransferCapacityDto, actor: AdminActor) {
    await this.assertVehicleClass(vehicleClassId);
    if (dto.endDate < dto.startDate) throw Errors.conflict("VALIDATION_FAILED", "endDate must not be before startDate");
    const dates = datesBetween(dto.startDate, dto.endDate);
    if (dates.length > MAX_RANGE_DAYS) throw Errors.conflict("RANGE_TOO_LARGE", `A single update can cover at most ${MAX_RANGE_DAYS} days`);

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const date of dates) {
          await guardedSetTransferCapacityTotal(tx, vehicleClassId, date, dto.totalUnits);
        }
        await writeAudit(tx, {
          actor: auditActorOf(actor),
          action: "transfer_capacity.set",
          aggregateType: "TransferVehicleClass",
          aggregateId: vehicleClassId,
          after: { startDate: dto.startDate, endDate: dto.endDate, totalUnits: dto.totalUnits },
        });
      });
    } catch (error) {
      throw toAdminHttp(error);
    }
    return this.list(vehicleClassId, dto.startDate, dto.endDate);
  }
}
