import { Body, Controller, Get, Param, Put, Query, UseGuards } from "@nestjs/common";
import { Matches } from "class-validator";
import { Role } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/jwt-auth.guard";
import { CurrentUser, Roles, RolesGuard } from "../../common/authz";
import { adminActorFrom } from "../common/admin-actor";
import { SetRoomInventoryDto } from "./admin-room-inventory.dto";
import { AdminRoomInventoryService } from "./admin-room-inventory.service";

class InventoryRangeQuery {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;
}

@Controller("admin/hotels/:hotelId/rooms/:roomId/inventory")
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AdminRoomInventoryController {
  constructor(private readonly inventory: AdminRoomInventoryService) {}

  @Get()
  list(@Param("hotelId") hotelId: string, @Param("roomId") roomId: string, @Query() query: InventoryRangeQuery) {
    return this.inventory.list(hotelId, roomId, query.from, query.to);
  }

  @Put()
  setRange(@Param("hotelId") hotelId: string, @Param("roomId") roomId: string, @Body() dto: SetRoomInventoryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inventory.setRange(hotelId, roomId, dto, adminActorFrom(user));
  }
}
