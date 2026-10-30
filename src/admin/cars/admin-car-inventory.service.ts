import { Injectable } from "@nestjs/common";
import { Errors } from "../../common/errors";
import { writeAudit } from "../../common/audit";
import { PrismaService } from "../../prisma/prisma.service";
import { guardedSetCarInventoryTotal } from "../common/guarded-capacity";
import { toAdminHttp } from "../common/admin-errors";
import { AdminActor, auditActorOf } from "../common/admin-actor";
import { datesBetween, MAX_RANGE_DAYS } from "../common/date-range";
import { SetCarInventoryDto } from "./admin-car-inventory.dto";

@Injectable()
export class AdminCarInventoryService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertCarModel(carModelId: string): Promise<void> {
    const car = await this.prisma.carModel.findUnique({ where: { id: carModelId } });
    if (!car || car.deletedAt) throw Errors.notFound("Car model");
  }

  async list(carModelId: string, locationId: string, from: string, to: string) {
    await this.assertCarModel(carModelId);
    return this.prisma.carInventory.findMany({
      where: { carModelId, locationId, date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
      orderBy: { date: "asc" },
    });
  }

  /** All-or-nothing over the date range — see guarded-capacity.ts and hotels' room-inventory
   *  service, which this mirrors exactly for a different owning table. */
  async setRange(carModelId: string, dto: SetCarInventoryDto, actor: AdminActor) {
    await this.assertCarModel(carModelId);
    const location = await this.prisma.location.findUnique({ where: { id: dto.locationId } });
    if (!location || location.deletedAt) throw Errors.notFound("Location");
    if (dto.endDate < dto.startDate) throw Errors.conflict("VALIDATION_FAILED", "endDate must not be before startDate");
    const dates = datesBetween(dto.startDate, dto.endDate);
    if (dates.length > MAX_RANGE_DAYS) throw Errors.conflict("RANGE_TOO_LARGE", `A single update can cover at most ${MAX_RANGE_DAYS} days`);

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const date of dates) {
          await guardedSetCarInventoryTotal(tx, carModelId, dto.locationId, date, dto.totalUnits);
        }
        await writeAudit(tx, {
          actor: auditActorOf(actor),
          action: "car_inventory.set",
          aggregateType: "CarModel",
          aggregateId: carModelId,
          after: { locationId: dto.locationId, startDate: dto.startDate, endDate: dto.endDate, totalUnits: dto.totalUnits },
        });
      });
    } catch (error) {
      throw toAdminHttp(error);
    }
    return this.list(carModelId, dto.locationId, dto.startDate, dto.endDate);
  }
}
