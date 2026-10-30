import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/jwt-auth.guard";
import { CurrentUser, Roles, RolesGuard } from "../../common/authz";
import { adminActorFrom } from "../common/admin-actor";
import { UpdateSettingBodyDto, UpdateSettingParam } from "./admin-settings.dto";
import { AdminSettingsService } from "./admin-settings.service";

@Controller("admin/settings")
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AdminSettingsController {
  constructor(private readonly settings: AdminSettingsService) {}

  @Get()
  list() {
    return this.settings.list();
  }

  @Patch(":key")
  update(@Param() param: UpdateSettingParam, @Body() dto: UpdateSettingBodyDto, @CurrentUser() user: AuthenticatedUser) {
    return this.settings.update(param.key, dto.value, adminActorFrom(user));
  }
}
