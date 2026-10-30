import { Body, Controller, Get, Param, Put, Query, UseGuards } from "@nestjs/common";
import { Matches } from "class-validator";
import { Role } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/jwt-auth.guard";
import { CurrentUser, Roles, RolesGuard } from "../../common/authz";
import { adminActorFrom } from "../common/admin-actor";
import { SetTransferCapacityDto } from "./admin-transfer-capacity.dto";
import { AdminTransferCapacityService } from "./admin-transfer-capacity.service";

class CapacityRangeQuery {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;
}

@Controller("admin/transfer-vehicle-classes/:vehicleClassId/capacity")
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AdminTransferCapacityController {
  constructor(private readonly capacity: AdminTransferCapacityService) {}

  @Get()
  list(@Param("vehicleClassId") vehicleClassId: string, @Query() query: CapacityRangeQuery) {
    return this.capacity.list(vehicleClassId, query.from, query.to);
  }

  @Put()
  setRange(@Param("vehicleClassId") vehicleClassId: string, @Body() dto: SetTransferCapacityDto, @CurrentUser() user: AuthenticatedUser) {
    return this.capacity.setRange(vehicleClassId, dto, adminActorFrom(user));
  }
}
