import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/jwt-auth.guard";
import { CurrentUser, Roles, RolesGuard } from "../../common/authz";
import { adminActorFrom } from "../common/admin-actor";
import { SetStatusDto } from "../common/set-status.dto";
import { CreateLocationDto, ListLocationsQuery, UpdateLocationDto } from "./admin-locations.dto";
import { AdminLocationsService } from "./admin-locations.service";

@Controller("admin/locations")
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AdminLocationsController {
  constructor(private readonly locations: AdminLocationsService) {}

  @Get()
  list(@Query() query: ListLocationsQuery) {
    return this.locations.list(query);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.locations.get(id);
  }

  @Post()
  create(@Body() dto: CreateLocationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.locations.create(dto, adminActorFrom(user));
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateLocationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.locations.update(id, dto, adminActorFrom(user));
  }

  @Patch(":id/status")
  setStatus(@Param("id") id: string, @Body() dto: SetStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.locations.setStatus(id, dto.status, adminActorFrom(user));
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.locations.remove(id, adminActorFrom(user));
  }
}
