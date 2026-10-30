import { INestApplication } from "@nestjs/common";
import { Test, TestingModuleBuilder } from "@nestjs/testing";
import type { App } from "supertest/types";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/app.factory";
import { loadConfig } from "../../src/config/env";
import { MailService } from "../../src/mail/mail.service";
import { PrismaService } from "../../src/prisma/prisma.service";

export interface TestApp {
  app: INestApplication<App>;
  prisma: PrismaService;
  mail: MailService;
  close: () => Promise<void>;
}

/**
 * Boots the real application against the test database.
 *
 * `configureModule` is for failure-injection tests only: it runs before `.compile()`, so a test can
 * call `.overrideProvider(...)` to replace a single provider (for example BookingTransactionHooks)
 * with a version that throws at a chosen step. That override exists only inside that test's own
 * TestingModuleBuilder; nothing about it is reachable from production wiring.
 */
export async function createTestApp(
  overrides: Record<string, string> = {},
  configureModule?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<TestApp> {
  Object.assign(process.env, {
    MAIL_TRANSPORT: "memory",
    RATE_LIMIT_ENABLED: "false",
    // The scheduler is tested directly (HoldExpirationScheduler.tick()), never as a live background
    // timer racing against whatever a test is doing to the same database.
    HOLD_SCHEDULER_ENABLED: "false",
    PAYMENT_PROOF_DIR: "var/payment-proofs-test",
    ...overrides,
  });
  if (!/_test/.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("Integration tests must use the _test database");
  }
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (configureModule) builder = configureModule(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app, loadConfig());
  await app.init();
  return {
    app,
    prisma: app.get(PrismaService),
    mail: app.get(MailService),
    close: () => app.close(),
  };
}

/** Clears the rows that individual tests create. Audit rows are append-only and are never removed. */
export async function resetData(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "AuthToken", "Favorite", "User" RESTART IDENTITY CASCADE',
  );
}

/** Extracts the single-use token from the last email sent to an address. */
export function tokenFromMail(mail: MailService, to: string): string {
  const message = [...mail.outbox()].reverse().find((m) => m.to === to && m.text.includes("token="));
  const match = message ? /token=([A-Za-z0-9_-]+)/.exec(message.text) : null;
  if (!match?.[1]) throw new Error(`no token mail for ${to}`);
  return match[1];
}
