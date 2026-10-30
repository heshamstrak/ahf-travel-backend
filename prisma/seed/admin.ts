import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../../src/security/password";

const DEV_ADMIN_EMAIL = "admin@ahf-travel.example";
const DEV_ADMIN_PASSWORD = "DevAdmin!2026"; // local development only; never used outside this guard

/**
 * A single development admin account, so the admin dashboard is reachable immediately after a
 * fresh `npm run seed` without a manual provisioning step. Gated to non-production: real staff
 * accounts are provisioned through POST /admin/staff by an existing admin (Milestone 6), never by
 * a seed script with a hard-coded password. Idempotent: upserts, never creates a duplicate.
 */
export async function seedDevAdmin(prisma: PrismaClient): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  const passwordHash = await hashPassword(DEV_ADMIN_PASSWORD);
  await prisma.user.upsert({
    where: { email: DEV_ADMIN_EMAIL },
    create: {
      email: DEV_ADMIN_EMAIL,
      passwordHash,
      firstName: "Dev",
      lastName: "Admin",
      role: "ADMIN",
      emailVerifiedAt: new Date(),
    },
    update: {}, // never overwrite an admin's real password once the row exists
  });
  console.log(`Dev admin ready: ${DEV_ADMIN_EMAIL} / ${DEV_ADMIN_PASSWORD} (local development only)`);
}
