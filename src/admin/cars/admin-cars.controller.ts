import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/jwt-auth.guard";
import { CurrentUser, Roles, RolesGuard } from "../../common/authz";
import { PageQueryDto } from "../../catalog/common/query";
import { adminActorFrom } from "../common/admin-actor";
import { SetStatusDto } from "../common/set-status.dto";
import { CreateCarModelDto, UpdateCarModelDto } from "./admin-cars.dto";
import { AdminCarsService } from "./admin-cars.service";

@Controller("admin/cars")
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AdminCarsController {
  constructor(private readonly cars: AdminCarsService) {}

  @Get()
  list(@Query() query: PageQueryDto) {
    return this.cars.list(query);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.cars.get(id);
  }

  @Post()
  create(@Body() dto: CreateCarModelDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cars.create(dto, adminActorFrom(user));
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateCarModelDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cars.update(id, dto, adminActorFrom(user));
  }

  @Patch(":id/status")
  setStatus(@Param("id") id: string, @Body() dto: SetStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cars.setStatus(id, dto.status, adminActorFrom(user));
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cars.remove(id, adminActorFrom(user));
  }
}
