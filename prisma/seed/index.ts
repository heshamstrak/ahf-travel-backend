import { PrismaClient } from "@prisma/client";
import { seedCatalogue } from "./catalogue";
import { seedDevAdmin } from "./admin";

/**
 * Entry point for `prisma db seed` (configured in package.json). Idempotent: safe to run repeatedly.
 * It never deletes rows. Use scripts/seed-test.mjs to seed the test database.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // Print only the database name, never the credentials, so the target is visible before rows change.
  console.log(`Seeding database "${new URL(url).pathname.replace(/^\//, "")}"`);

  const prisma = new PrismaClient();
  try {
    const summary = await seedCatalogue(prisma);
    await seedDevAdmin(prisma);
    console.log("Seed complete:", summary);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
