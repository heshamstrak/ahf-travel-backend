import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/jwt-auth.guard";
import { CurrentUser, Roles, RolesGuard } from "../../common/authz";
import { adminActorFrom } from "../common/admin-actor";
import { AdminCancelBookingDto, ListBookingsQuery } from "./admin-bookings.dto";
import { AdminBookingsService } from "./admin-bookings.service";

@Controller("admin/bookings")
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.FINANCE, Role.SUPPORT)
export class AdminBookingsController {
  constructor(private readonly bookings: AdminBookingsService) {}

  @Get()
  list(@Query() query: ListBookingsQuery) {
    return this.bookings.list(query);
  }

  @Get(":idOrReference")
  detail(@Param("idOrReference") idOrReference: string) {
    return this.bookings.detail(idOrReference);
  }

  @Post(":idOrReference/cancel")
  @Roles(Role.ADMIN, Role.SUPPORT)
  cancel(@Param("idOrReference") idOrReference: string, @Body() dto: AdminCancelBookingDto, @CurrentUser() user: AuthenticatedUser) {
    return this.bookings.cancel(idOrReference, adminActorFrom(user), dto.reason);
  }
}
