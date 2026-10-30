import { CanActivate, ExecutionContext, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { Role, UserStatus } from "@prisma/client";
import { Errors } from "../common/errors";
import { InvalidTokenError } from "../security/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "./auth.service";

export const IS_PUBLIC = "isPublic";
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

export const IS_OPTIONAL = "isOptionalAuth";
/**
 * The route works for guests and signed-in users. A bearer token is verified when present; without one
 * the request proceeds with no user. A present but invalid token is still rejected.
 */
export const OptionalAuth = (): MethodDecorator & ClassDecorator => SetMetadata(IS_OPTIONAL, true);

export interface AuthenticatedUser {
  id: string;
  role: Role;
  sessionId: string;
  email: string;
  firstName: string;
  lastName: string;
}

export type AuthedRequest = Request & { user?: AuthenticatedUser };

/**
 * Verifies the bearer token, then checks that the session it belongs to is still alive.
 * The session check makes logout and password change effective immediately, without a denylist.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.header("authorization") ?? "";
    const optional = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL, [context.getHandler(), context.getClass()]);
    if (optional && header === "") return true;
    const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(header);
    if (!match?.[1]) throw Errors.unauthenticated();

    let claims: { sub: string; role: string; sid: string };
    try {
      claims = this.auth.verifyAccessToken(match[1]);
    } catch (error) {
      if (error instanceof InvalidTokenError) throw Errors.unauthenticated();
      throw error;
    }

    const user = await this.prisma.user.findUnique({ where: { id: claims.sub } });
    if (!user || user.status !== UserStatus.ACTIVE) throw Errors.unauthenticated();
    if (!(await this.auth.isSessionActive(claims.sid))) throw Errors.unauthenticated();

    req.user = {
      id: user.id,
      role: user.role,
      sessionId: claims.sid,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    };
    return true;
  }
}

