import request from "supertest";
import type { App } from "supertest/types";
import { createTestApp, TestApp } from "./support/app";

describe("Health endpoints (integration)", () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    t = await createTestApp();
    http = request(t.app.getHttpServer() as App);
  });

  afterAll(async () => {
    await t.close();
  });

  it("reports liveness without authentication", async () => {
    const res = await http.get("/api/v1/health/live").expect(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(res.headers["x-request-id"]).toBeDefined();
  });

  it("reports readiness when the database answers", async () => {
    const res = await http.get("/api/v1/health/ready").expect(200);
    expect(res.body).toEqual({ status: "ok", database: "up" });
  });

  it("echoes a safe incoming request id and replaces an unsafe one", async () => {
    const safe = await http.get("/api/v1/health/live").set("X-Request-Id", "trace-abc123456").expect(200);
    expect(safe.headers["x-request-id"]).toBe("trace-abc123456");
    const unsafe = await http.get("/api/v1/health/live").set("X-Request-Id", "bad id with spaces").expect(200);
    expect(unsafe.headers["x-request-id"]).not.toBe("bad id with spaces");
  });
});
