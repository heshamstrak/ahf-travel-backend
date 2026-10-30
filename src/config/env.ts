import { z } from "zod";

const boolFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1),
  APP_ORIGIN: z.string().url(),
  COOKIE_SECURE: boolFromString,
  RATE_LIMIT_ENABLED: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  MAIL_TRANSPORT: z.enum(["log", "memory"]).default("log"),
  JWT_PRIVATE_KEY_B64: z.string().min(1),
  JWT_PUBLIC_KEY_B64: z.string().min(1),
  JWT_ISSUER: z.string().min(1).default("egypt-beyond-api"),
  JWT_AUDIENCE: z.string().min(1).default("egypt-beyond-web"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  EMAIL_VERIFICATION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(240).default(30),
  LOGIN_MAX_FAILURES: z.coerce.number().int().min(1).max(20).default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  // Initial minimum driver age for car rental (product configuration seeded to this value).
  MEDIA_CDN_BASE_URL: z.string().url().default("https://cdn.ahf-travel.example"),
  PRISMA_QUERY_EVENTS: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  DEFAULT_CAR_MIN_DRIVER_AGE: z.coerce.number().int().min(18).max(99).default(21),
  // Milestone 5: InstaPay receipt storage and the hold-expiration scheduler.
  PAYMENT_PROOF_DIR: z.string().min(1).default("var/payment-proofs"),
  PAYMENT_PROOF_MAX_BYTES: z.coerce.number().int().min(1).default(5 * 1024 * 1024),
  HOLD_SCHEDULER_ENABLED: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  HOLD_SCHEDULER_INTERVAL_MS: z.coerce.number().int().min(1000).default(60_000),
  // Milestone 6: admin-uploaded public catalogue images (separate from InstaPay receipts, which
  // stay private under PAYMENT_PROOF_DIR).
  PUBLIC_MEDIA_DIR: z.string().min(1).default("var/public-media"),
  PUBLIC_MEDIA_MAX_BYTES: z.coerce.number().int().min(1).default(8 * 1024 * 1024),
});

export type RawEnv = z.infer<typeof envSchema>;

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  appOrigin: string;
  cookieSecure: boolean;
  rateLimitEnabled: boolean;
  mailTransport: "log" | "memory";
  jwt: {
    privateKeyPem: string;
    publicKeyPem: string;
    issuer: string;
    audience: string;
    accessTtlSeconds: number;
  };
  refreshTtlDays: number;
  emailVerificationTtlHours: number;
  passwordResetTtlMinutes: number;
  loginMaxFailures: number;
  loginLockMinutes: number;
  defaultCarMinDriverAge: number;
  prismaQueryEvents: boolean;
  mediaCdnBaseUrl: string;
  paymentProofDir: string;
  paymentProofMaxBytes: number;
  holdSchedulerEnabled: boolean;
  holdSchedulerIntervalMs: number;
  publicMediaDir: string;
  publicMediaMaxBytes: number;
}

export class ConfigError extends Error {}

/** Parses and validates configuration. Throws ConfigError naming every invalid variable. */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new ConfigError(`Invalid configuration: ${details}`);
  }
  const env = parsed.data;
  const decode = (b64: string, name: string): string => {
    const pem = Buffer.from(b64, "base64").toString("utf8");
    if (!pem.includes("-----BEGIN")) {
      throw new ConfigError(`Invalid configuration: ${name} is not a base64-encoded PEM key`);
    }
    return pem;
  };
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    appOrigin: env.APP_ORIGIN,
    cookieSecure: env.COOKIE_SECURE,
    rateLimitEnabled: env.RATE_LIMIT_ENABLED,
    mailTransport: env.MAIL_TRANSPORT,
    jwt: {
      privateKeyPem: decode(env.JWT_PRIVATE_KEY_B64, "JWT_PRIVATE_KEY_B64"),
      publicKeyPem: decode(env.JWT_PUBLIC_KEY_B64, "JWT_PUBLIC_KEY_B64"),
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      accessTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
    },
    refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
    emailVerificationTtlHours: env.EMAIL_VERIFICATION_TTL_HOURS,
    passwordResetTtlMinutes: env.PASSWORD_RESET_TTL_MINUTES,
    loginMaxFailures: env.LOGIN_MAX_FAILURES,
    loginLockMinutes: env.LOGIN_LOCK_MINUTES,
    defaultCarMinDriverAge: env.DEFAULT_CAR_MIN_DRIVER_AGE,
    prismaQueryEvents: env.PRISMA_QUERY_EVENTS,
    mediaCdnBaseUrl: env.MEDIA_CDN_BASE_URL.replace(/\/$/, ""),
    paymentProofDir: env.PAYMENT_PROOF_DIR,
    paymentProofMaxBytes: env.PAYMENT_PROOF_MAX_BYTES,
    holdSchedulerEnabled: env.HOLD_SCHEDULER_ENABLED,
    holdSchedulerIntervalMs: env.HOLD_SCHEDULER_INTERVAL_MS,
    publicMediaDir: env.PUBLIC_MEDIA_DIR,
    publicMediaMaxBytes: env.PUBLIC_MEDIA_MAX_BYTES,
  };
}
