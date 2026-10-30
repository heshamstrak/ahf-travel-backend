import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/jwt-auth.guard";
import { CurrentUser, Roles, RolesGuard } from "../../common/authz";
import { PageQueryDto } from "../../catalog/common/query";
import { adminActorFrom } from "../common/admin-actor";
import { SetStatusDto } from "../common/set-status.dto";
import { CreateTourDto, UpdateTourDto } from "./admin-tours.dto";
import { AdminToursService } from "./admin-tours.service";

@Controller("admin/tours")
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AdminToursController {
  constructor(private readonly tours: AdminToursService) {}

  @Get()
  list(@Query() query: PageQueryDto) {
    return this.tours.list(query);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.tours.get(id);
  }

  @Post()
  create(@Body() dto: CreateTourDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tours.create(dto, adminActorFrom(user));
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateTourDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tours.update(id, dto, adminActorFrom(user));
  }

  @Patch(":id/status")
  setStatus(@Param("id") id: string, @Body() dto: SetStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tours.setStatus(id, dto.status, adminActorFrom(user));
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tours.remove(id, adminActorFrom(user));
  }
}
