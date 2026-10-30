import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { APP_CONFIG } from "../config/config.module";
import type { AppConfig } from "../config/env";
import { CurrentUser } from "../common/authz";
import { metaOf } from "../common/request-context.middleware";
import { AuthService } from "./auth.service";
import { EmailDto, LoginDto, RegisterDto, ResetPasswordDto, TokenDto } from "./auth.dto";
import { Public, AuthenticatedUser } from "./jwt-auth.guard";
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from "./session";

// Credential endpoints: 10 requests per minute per client. Refresh is looser (normal app usage).
const CREDENTIAL_LIMIT = { default: { limit: 10, ttl: 60_000 } };
const REFRESH_LIMIT = { default: { limit: 60, ttl: 60_000 } };

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Throttle(CREDENTIAL_LIMIT)
  @Post("register")
  @HttpCode(HttpStatus.ACCEPTED)
  async register(@Body() dto: RegisterDto, @Req() req: Request): Promise<{ status: "verification_sent" }> {
    await this.auth.register(dto, metaOf(req));
    return { status: "verification_sent" };
  }

  @Public()
  @Throttle(CREDENTIAL_LIMIT)
  @Post("verify-email")
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: TokenDto, @Req() req: Request): Promise<{ status: "verified" }> {
    await this.auth.verifyEmail(dto.token, metaOf(req));
    return { status: "verified" };
  }

  @Public()
  @Throttle(CREDENTIAL_LIMIT)
  @Post("resend-verification")
  @HttpCode(HttpStatus.ACCEPTED)
  async resendVerification(@Body() dto: EmailDto): Promise<{ status: "accepted" }> {
    await this.auth.resendVerification(dto.email);
    return { status: "accepted" };
  }

  @Public()
  @Throttle(CREDENTIAL_LIMIT)
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.login(dto, metaOf(req));
    setRefreshCookie(res, this.config, session.refreshToken, session.refreshExpiresAt);
    return {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      user: session.user,
    };
  }

  @Public()
  @Throttle(REFRESH_LIMIT)
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.refresh(readRefreshCookie(req), metaOf(req));
    setRefreshCookie(res, this.config, tokens.refreshToken, tokens.refreshExpiresAt);
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  }

  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(readRefreshCookie(req), metaOf(req));
    clearRefreshCookie(res, this.config);
  }

  @Post("logout-all")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logoutAll(user.id, metaOf(req));
    clearRefreshCookie(res, this.config);
  }

  @Public()
  @Throttle(CREDENTIAL_LIMIT)
  @Post("forgot-password")
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(@Body() dto: EmailDto): Promise<{ status: "accepted" }> {
    await this.auth.forgotPassword(dto.email);
    return { status: "accepted" };
  }

  @Public()
  @Throttle(CREDENTIAL_LIMIT)
  @Post("reset-password")
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request): Promise<void> {
    await this.auth.resetPassword(dto.token, dto.newPassword, metaOf(req));
  }

  /** Session introspection for the frontend: who am I, and is my session alive. */
  @Get("session")
  @HttpCode(HttpStatus.OK)
  session(@CurrentUser() user: AuthenticatedUser): { userId: string; role: string } {
    return { userId: user.id, role: user.role };
  }
}

