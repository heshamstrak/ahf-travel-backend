import type { Request, Response } from "express";
import type { AppConfig } from "../config/env";

export const REFRESH_COOKIE = "eb_refresh";
export const REFRESH_COOKIE_PATH = "/api/v1/auth";

/** Refresh token lives only in an HttpOnly cookie scoped to the auth routes. */
export function setRefreshCookie(res: Response, config: AppConfig, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
    expires: expiresAt,
  });
}

export function clearRefreshCookie(res: Response, config: AppConfig): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
  });
}

export function readRefreshCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[REFRESH_COOKIE];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
