import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/jwt-auth.guard";
import { CurrentUser, Roles, RolesGuard } from "../../common/authz";
import { adminActorFrom } from "../common/admin-actor";
import { SetStatusDto } from "../common/set-status.dto";
import { CreateRoomDto, ListAllRoomsQuery, UpdateRoomDto } from "./admin-rooms.dto";
import { AdminRoomsService } from "./admin-rooms.service";

/** The standalone, cross-hotel "Hotel Rooms" table (admin brief: rooms deserve their own top-level
 *  view, not just nested inside each hotel). A separate controller/route so it doesn't collide
 *  with AdminRoomsController's `:hotelId/rooms` path below — both share the one service. */
@Controller("admin/rooms")
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AdminRoomsIndexController {
  constructor(private readonly rooms: AdminRoomsService) {}

  @Get()
  listAll(@Query() query: ListAllRoomsQuery) {
    return this.rooms.listAll(query);
  }
}

@Controller("admin/hotels/:hotelId/rooms")
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AdminRoomsController {
  constructor(private readonly rooms: AdminRoomsService) {}

  @Get()
  list(@Param("hotelId") hotelId: string) {
    return this.rooms.list(hotelId);
  }

  @Get(":roomId")
  get(@Param("hotelId") hotelId: string, @Param("roomId") roomId: string) {
    return this.rooms.get(hotelId, roomId);
  }

  @Post()
  create(@Param("hotelId") hotelId: string, @Body() dto: CreateRoomDto, @CurrentUser() user: AuthenticatedUser) {
    return this.rooms.create(hotelId, dto, adminActorFrom(user));
  }

  @Patch(":roomId")
  update(@Param("hotelId") hotelId: string, @Param("roomId") roomId: string, @Body() dto: UpdateRoomDto, @CurrentUser() user: AuthenticatedUser) {
    return this.rooms.update(hotelId, roomId, dto, adminActorFrom(user));
  }

  @Patch(":roomId/status")
  setStatus(@Param("hotelId") hotelId: string, @Param("roomId") roomId: string, @Body() dto: SetStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.rooms.setStatus(hotelId, roomId, dto.status, adminActorFrom(user));
  }

  @Delete(":roomId")
  @HttpCode(204)
  remove(@Param("hotelId") hotelId: string, @Param("roomId") roomId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.rooms.remove(hotelId, roomId, adminActorFrom(user));
  }
}
