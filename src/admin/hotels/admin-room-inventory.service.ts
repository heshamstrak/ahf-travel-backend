import { Injectable } from "@nestjs/common";
import { Errors } from "../../common/errors";
import { writeAudit } from "../../common/audit";
import { PrismaService } from "../../prisma/prisma.service";
import { guardedSetRoomInventoryTotal } from "../common/guarded-capacity";
import { toAdminHttp } from "../common/admin-errors";
import { AdminActor, auditActorOf } from "../common/admin-actor";
import { datesBetween, MAX_RANGE_DAYS } from "../common/date-range";
import { SetRoomInventoryDto } from "./admin-room-inventory.dto";

@Injectable()
export class AdminRoomInventoryService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertRoom(hotelId: string, roomId: string): Promise<void> {
    const room = await this.prisma.room.findFirst({ where: { id: roomId, hotelId } });
    if (!room || room.deletedAt) throw Errors.notFound("Room");
  }

  async list(hotelId: string, roomId: string, from: string, to: string) {
    await this.assertRoom(hotelId, roomId);
    return this.prisma.roomInventory.findMany({
      where: { roomId, date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
      orderBy: { date: "asc" },
    });
  }

  /**
   * Sets totalUnits for every date in the range, all-or-nothing: if any single date's new total
   * would fall below what is already held, sold or blocked there, the entire range update is
   * rejected and nothing in the range changes — never a partial write across some dates only.
   */
  async setRange(hotelId: string, roomId: string, dto: SetRoomInventoryDto, actor: AdminActor) {
    await this.assertRoom(hotelId, roomId);
    if (dto.endDate < dto.startDate) {
      throw Errors.conflict("VALIDATION_FAILED", "endDate must not be before startDate");
    }
    const dates = datesBetween(dto.startDate, dto.endDate);
    if (dates.length > MAX_RANGE_DAYS) {
      throw Errors.conflict("RANGE_TOO_LARGE", `A single update can cover at most ${MAX_RANGE_DAYS} days`);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const date of dates) {
          await guardedSetRoomInventoryTotal(tx, roomId, date, dto.totalUnits);
        }
        await writeAudit(tx, {
          actor: auditActorOf(actor),
          action: "room_inventory.set",
          aggregateType: "Room",
          aggregateId: roomId,
          after: { startDate: dto.startDate, endDate: dto.endDate, totalUnits: dto.totalUnits },
        });
      });
    } catch (error) {
      throw toAdminHttp(error);
    }
    return this.list(hotelId, roomId, dto.startDate, dto.endDate);
  }
}
