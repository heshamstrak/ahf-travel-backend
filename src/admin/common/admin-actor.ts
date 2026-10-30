import type { Role } from "@prisma/client";
import type { AuditActor } from "../../common/audit";
import type { AuthenticatedUser } from "../../auth/jwt-auth.guard";

/** The subset of an authenticated staff member a service needs: enough to audit and to check
 *  fine-grained ownership, nothing more. Every admin service takes this narrower type rather than
 *  the full `AuthenticatedUser`, so a controller is the only place that reads the request's user. */
export interface AdminActor {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export function adminActorFrom(user: AuthenticatedUser): AdminActor {
  return { id: user.id, email: user.email, name: `${user.firstName} ${user.lastName}`.trim(), role: user.role };
}

/** Every admin mutation audits the acting staff member by a snapshot, not a live foreign key, the
 *  same convention Milestones 4–5 established for customer and system actors. */
export function auditActorOf(actor: AdminActor): AuditActor {
  return { type: "ADMIN", id: actor.id, email: actor.email, name: actor.name, role: actor.role };
}
