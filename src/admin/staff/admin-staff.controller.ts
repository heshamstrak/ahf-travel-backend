import { Body, Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/jwt-auth.guard";
import { CurrentUser, Roles, RolesGuard } from "../../common/authz";
import { adminActorFrom } from "../common/admin-actor";
import { CreateStaffDto } from "./admin-staff.dto";
import { AdminStaffService } from "./admin-staff.service";

/** Only an existing ADMIN can provision another staff account — never self-service, never open. */
@Controller("admin/staff")
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AdminStaffController {
  constructor(private readonly staff: AdminStaffService) {}

  @Get()
  list() {
    return this.staff.list();
  }

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateStaffDto, @CurrentUser() user: AuthenticatedUser) {
    return this.staff.create(dto, adminActorFrom(user));
  }
}
