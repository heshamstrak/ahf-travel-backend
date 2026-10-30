import { Controller, Get, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/jwt-auth.guard";
import { CurrentUser, Roles, RolesGuard } from "../../common/authz";

/** Any staff role can read their own profile — this is "who am I", not a management action. */
@Controller("admin/profile")
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.FINANCE, Role.SUPPORT, Role.CONTENT_EDITOR)
export class AdminProfileController {
  @Get()
  me(@CurrentUser() user: AuthenticatedUser) {
    return { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role };
  }
}
