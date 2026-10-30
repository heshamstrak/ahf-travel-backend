import { Body, Controller, Get, Param, Put, Query, UseGuards } from "@nestjs/common";
import { IsUUID, Matches } from "class-validator";
import { Role } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/jwt-auth.guard";
import { CurrentUser, Roles, RolesGuard } from "../../common/authz";
import { adminActorFrom } from "../common/admin-actor";
import { SetCarInventoryDto } from "./admin-car-inventory.dto";
import { AdminCarInventoryService } from "./admin-car-inventory.service";

class CarInventoryRangeQuery {
  @IsUUID()
  locationId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;
}

@Controller("admin/cars/:carModelId/inventory")
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AdminCarInventoryController {
  constructor(private readonly inventory: AdminCarInventoryService) {}

  @Get()
  list(@Param("carModelId") carModelId: string, @Query() query: CarInventoryRangeQuery) {
    return this.inventory.list(carModelId, query.locationId, query.from, query.to);
  }

  @Put()
  setRange(@Param("carModelId") carModelId: string, @Body() dto: SetCarInventoryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inventory.setRange(carModelId, dto, adminActorFrom(user));
  }
}
