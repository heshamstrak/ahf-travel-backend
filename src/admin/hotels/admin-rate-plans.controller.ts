import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/jwt-auth.guard";
import { CurrentUser, Roles, RolesGuard } from "../../common/authz";
import { adminActorFrom } from "../common/admin-actor";
import { SetStatusDto } from "../common/set-status.dto";
import { CreateRatePlanDto, UpdateRatePlanDto } from "./admin-rate-plans.dto";
import { AdminRatePlansService } from "./admin-rate-plans.service";

@Controller("admin/hotels/:hotelId/rooms/:roomId/rate-plans")
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AdminRatePlansController {
  constructor(private readonly ratePlans: AdminRatePlansService) {}

  @Get()
  list(@Param("hotelId") hotelId: string, @Param("roomId") roomId: string) {
    return this.ratePlans.list(hotelId, roomId);
  }

  @Get(":ratePlanId")
  get(@Param("hotelId") hotelId: string, @Param("roomId") roomId: string, @Param("ratePlanId") ratePlanId: string) {
    return this.ratePlans.get(hotelId, roomId, ratePlanId);
  }

  @Post()
  create(@Param("hotelId") hotelId: string, @Param("roomId") roomId: string, @Body() dto: CreateRatePlanDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ratePlans.create(hotelId, roomId, dto, adminActorFrom(user));
  }

  @Patch(":ratePlanId")
  update(
    @Param("hotelId") hotelId: string,
    @Param("roomId") roomId: string,
    @Param("ratePlanId") ratePlanId: string,
    @Body() dto: UpdateRatePlanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ratePlans.update(hotelId, roomId, ratePlanId, dto, adminActorFrom(user));
  }

  @Patch(":ratePlanId/status")
  setStatus(
    @Param("hotelId") hotelId: string,
    @Param("roomId") roomId: string,
    @Param("ratePlanId") ratePlanId: string,
    @Body() dto: SetStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ratePlans.setStatus(hotelId, roomId, ratePlanId, dto.status, adminActorFrom(user));
  }
}
