import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/jwt-auth.guard";
import { CurrentUser, Roles, RolesGuard } from "../../common/authz";
import { PageQueryDto } from "../../catalog/common/query";
import { adminActorFrom } from "../common/admin-actor";
import { SetStatusDto } from "../common/set-status.dto";
import { CreatePackageDto, UpdatePackageDto } from "./admin-packages.dto";
import { AdminPackagesService } from "./admin-packages.service";

@Controller("admin/packages")
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AdminPackagesController {
  constructor(private readonly packages: AdminPackagesService) {}

  @Get()
  list(@Query() query: PageQueryDto) {
    return this.packages.list(query);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.packages.get(id);
  }

  @Post()
  create(@Body() dto: CreatePackageDto, @CurrentUser() user: AuthenticatedUser) {
    return this.packages.create(dto, adminActorFrom(user));
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdatePackageDto, @CurrentUser() user: AuthenticatedUser) {
    return this.packages.update(id, dto, adminActorFrom(user));
  }

  @Patch(":id/status")
  setStatus(@Param("id") id: string, @Body() dto: SetStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.packages.setStatus(id, dto.status, adminActorFrom(user));
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.packages.remove(id, adminActorFrom(user));
  }
}
