import { generateKeyPairSync } from "crypto";
import { ConfigError, loadConfig } from "./env";

function pemB64(): string {
  const { privateKey } = generateKeyPairSync("ed25519");
  return Buffer.from(privateKey.export({ type: "pkcs8", format: "pem" })).toString("base64");
}

function validEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  const { publicKey } = generateKeyPairSync("ed25519");
  return {
    DATABASE_URL: "postgresql://u:p@localhost:5432/db",
    APP_ORIGIN: "http://localhost:3000",
    JWT_PRIVATE_KEY_B64: pemB64(),
    JWT_PUBLIC_KEY_B64: Buffer.from(publicKey.export({ type: "spki", format: "pem" })).toString("base64"),
    ...overrides,
  };
}

describe("loadConfig", () => {
  it("applies documented defaults", () => {
    const config = loadConfig(validEnv());
    expect(config.port).toBe(4000);
    expect(config.rateLimitEnabled).toBe(true);
    expect(config.cookieSecure).toBe(false);
    expect(config.jwt.accessTtlSeconds).toBe(600);
    expect(config.refreshTtlDays).toBe(30);
    expect(config.loginMaxFailures).toBe(5);
    expect(config.loginLockMinutes).toBe(15);
    expect(config.defaultCarMinDriverAge).toBe(21);
  });

  it("parses boolean flags from strings", () => {
    const config = loadConfig(validEnv({ RATE_LIMIT_ENABLED: "false", COOKIE_SECURE: "true" }));
    expect(config.rateLimitEnabled).toBe(false);
    expect(config.cookieSecure).toBe(true);
  });

  it("names every invalid variable in one error", () => {
    const env = validEnv({ APP_ORIGIN: "not-a-url", LOGIN_MAX_FAILURES: "0" });
    delete env.DATABASE_URL;
    expect(() => loadConfig(env)).toThrow(ConfigError);
    try {
      loadConfig(env);
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("DATABASE_URL");
      expect(message).toContain("APP_ORIGIN");
      expect(message).toContain("LOGIN_MAX_FAILURES");
    }
  });

  it("rejects a key that is not a PEM document", () => {
    expect(() => loadConfig(validEnv({ JWT_PRIVATE_KEY_B64: Buffer.from("hello").toString("base64") }))).toThrow(
      /JWT_PRIVATE_KEY_B64 is not a base64-encoded PEM key/,
    );
  });

  it("rejects an out-of-range access token lifetime", () => {
    expect(() => loadConfig(validEnv({ ACCESS_TOKEN_TTL_SECONDS: "86400" }))).toThrow(/ACCESS_TOKEN_TTL_SECONDS/);
  });
});
