import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/jwt-auth.guard";
import { CurrentUser, Roles, RolesGuard } from "../../common/authz";
import { adminActorFrom } from "../common/admin-actor";
import { CreateVehicleClassDto, UpdateVehicleClassDto } from "./admin-transfer-vehicle-classes.dto";
import { AdminTransferVehicleClassesService } from "./admin-transfer-vehicle-classes.service";

@Controller("admin/transfer-vehicle-classes")
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AdminTransferVehicleClassesController {
  constructor(private readonly vehicleClasses: AdminTransferVehicleClassesService) {}

  @Get()
  list() {
    return this.vehicleClasses.list();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.vehicleClasses.get(id);
  }

  @Post()
  create(@Body() dto: CreateVehicleClassDto, @CurrentUser() user: AuthenticatedUser) {
    return this.vehicleClasses.create(dto, adminActorFrom(user));
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateVehicleClassDto, @CurrentUser() user: AuthenticatedUser) {
    return this.vehicleClasses.update(id, dto, adminActorFrom(user));
  }
}
