import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/jwt-auth.guard";
import { CurrentUser, Roles, RolesGuard } from "../../common/authz";
import { adminActorFrom } from "../common/admin-actor";
import { CreatePackageDepartureDto, SetDepartureStatusDto, SetPackageDepartureCapacityDto, UpdatePackageDepartureDto } from "./admin-package-departures.dto";
import { AdminPackageDeparturesService } from "./admin-package-departures.service";

@Controller("admin/packages/:packageId/departures")
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AdminPackageDeparturesController {
  constructor(private readonly departures: AdminPackageDeparturesService) {}

  @Get()
  list(@Param("packageId") packageId: string) {
    return this.departures.list(packageId);
  }

  @Get(":departureId")
  get(@Param("packageId") packageId: string, @Param("departureId") departureId: string) {
    return this.departures.get(packageId, departureId);
  }

  @Post()
  create(@Param("packageId") packageId: string, @Body() dto: CreatePackageDepartureDto, @CurrentUser() user: AuthenticatedUser) {
    return this.departures.create(packageId, dto, adminActorFrom(user));
  }

  @Patch(":departureId")
  update(
    @Param("packageId") packageId: string,
    @Param("departureId") departureId: string,
    @Body() dto: UpdatePackageDepartureDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.departures.update(packageId, departureId, dto, adminActorFrom(user));
  }

  @Patch(":departureId/capacity")
  setCapacity(
    @Param("packageId") packageId: string,
    @Param("departureId") departureId: string,
    @Body() dto: SetPackageDepartureCapacityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.departures.setCapacity(packageId, departureId, dto.capacity, adminActorFrom(user));
  }

  @Patch(":departureId/status")
  setStatus(
    @Param("packageId") packageId: string,
    @Param("departureId") departureId: string,
    @Body() dto: SetDepartureStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.departures.setStatus(packageId, departureId, dto, adminActorFrom(user));
  }
}
