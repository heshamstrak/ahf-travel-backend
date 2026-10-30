import request from "supertest";
import type { App } from "supertest/types";
import { createTestApp, resetData, TestApp } from "./support/app";

describe("Rate limiting on credential endpoints (integration)", () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    t = await createTestApp({ RATE_LIMIT_ENABLED: "true" });
    http = request(t.app.getHttpServer() as App);
  });

  beforeEach(async () => {
    await resetData(t.prisma);
  });

  afterAll(async () => {
    await t.close();
  });

  it("returns 429 after the per-minute login allowance is spent", async () => {
    const body = { email: "nobody@example.com", password: "wrong-password-1" };
    for (let i = 0; i < 10; i++) {
      await http.post("/api/v1/auth/login").send(body).expect(401);
    }
    const limited = await http.post("/api/v1/auth/login").send(body).expect(429);
    expect(limited.body.code).toBe("RATE_LIMITED");
    expect(limited.headers["content-type"]).toContain("application/problem+json");
  });

  it("does not rate-limit health checks", async () => {
    for (let i = 0; i < 15; i++) {
      await http.get("/api/v1/health/live").expect(200);
    }
  });
});
