import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/jwt-auth.guard";
import { CurrentUser, Roles, RolesGuard } from "../../common/authz";
import { PageQueryDto } from "../../catalog/common/query";
import { adminActorFrom } from "../common/admin-actor";
import { SetStatusDto } from "../common/set-status.dto";
import { CreateDestinationDto, UpdateDestinationDto } from "./admin-destinations.dto";
import { AdminDestinationsService } from "./admin-destinations.service";

@Controller("admin/destinations")
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AdminDestinationsController {
  constructor(private readonly destinations: AdminDestinationsService) {}

  @Get()
  list(@Query() query: PageQueryDto) {
    return this.destinations.list(query);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.destinations.get(id);
  }

  @Post()
  create(@Body() dto: CreateDestinationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.destinations.create(dto, adminActorFrom(user));
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateDestinationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.destinations.update(id, dto, adminActorFrom(user));
  }

  @Patch(":id/status")
  setStatus(@Param("id") id: string, @Body() dto: SetStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.destinations.setStatus(id, dto.status, adminActorFrom(user));
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.destinations.remove(id, adminActorFrom(user));
  }
}
