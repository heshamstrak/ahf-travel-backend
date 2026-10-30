import { randomUUID } from "crypto";
import { Injectable } from "@nestjs/common";
import { Errors } from "../../common/errors";
import { writeAudit } from "../../common/audit";
import { hashPassword } from "../../security/password";
import { PrismaService } from "../../prisma/prisma.service";
import { AdminActor, auditActorOf } from "../common/admin-actor";
import { CreateStaffDto } from "./admin-staff.dto";

/**
 * The only way a staff account (ADMIN/FINANCE/SUPPORT/CONTENT_EDITOR) is ever created: by another
 * authenticated ADMIN, through this guarded endpoint. `/auth/register` (public) never sets a role,
 * so it can only ever produce CUSTOMER accounts — there is no path from the public internet to a
 * staff role.
 */
@Injectable()
export class AdminStaffService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.user.findMany({
      where: { role: { in: ["ADMIN", "FINANCE", "SUPPORT", "CONTENT_EDITOR"] } },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(dto: CreateStaffDto, actor: AdminActor) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw Errors.conflict("EMAIL_TAKEN", "An account with this email already exists");

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.user.create({
        data: {
          id: randomUUID(),
          email: dto.email.toLowerCase(),
          passwordHash: await hashPassword(dto.password),
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: dto.role,
          // Internally provisioned accounts are trusted immediately; there is no self-serve
          // verification email step for staff the way there is for customer registration.
          emailVerifiedAt: new Date(),
        },
        select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true, createdAt: true },
      });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "staff.created", aggregateType: "User", aggregateId: row.id, after: { email: row.email, role: row.role } });
      return row;
    });
  }
}
