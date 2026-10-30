import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service";
import { AuthenticatedUser } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/authz";
import { metaOf } from "../common/request-context.middleware";
import { ChangePasswordBodyDto, UpdatePreferencesDto, UpdateProfileDto } from "./users.dto";
import { UsersService } from "./users.service";

@Controller("users/me")
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.users.getMe(user.id);
  }

  @Patch()
  updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto, @Req() req: Request) {
    return this.users.updateProfile(user.id, dto, metaOf(req));
  }

  @Patch("preferences")
  updatePreferences(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdatePreferencesDto, @Req() req: Request) {
    return this.users.updatePreferences(user.id, dto, metaOf(req));
  }

  @Put("password")
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordBodyDto, @Req() req: Request): Promise<void> {
    await this.auth.changePassword(user.id, dto, user.sessionId, metaOf(req));
  }
}
