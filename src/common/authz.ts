import { CanActivate, ExecutionContext, HttpStatus, Injectable, SetMetadata, createParamDecorator } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role } from "@prisma/client";
import { AppError, Errors } from "./errors";
import type { AuthedRequest, AuthenticatedUser } from "../auth/jwt-auth.guard";

export const ROLES_KEY = "roles";
/** Restricts a route to the listed roles. Must be used after JwtAuthGuard. */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const role = req.user?.role;
    if (!role) throw Errors.unauthenticated();
    if (!required.includes(role)) {
      throw new AppError(HttpStatus.FORBIDDEN, "FORBIDDEN", "Your role cannot perform this action");
    }
    return true;
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.user) throw Errors.unauthenticated();
  return req.user;
});
