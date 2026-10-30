import request from "supertest";
import { randomUUID } from "crypto";
import type { App } from "supertest/types";
import { createTestApp, resetData, TestApp, tokenFromMail } from "./support/app";

const PASSWORD = "correct-horse-battery";

function uniqueEmail(): string {
  return `user-${randomUUID().slice(0, 8)}@example.com`;
}

function refreshCookieOf(res: request.Response): string | undefined {
  const cookies = res.headers["set-cookie"] as unknown as string[] | undefined;
  return cookies?.find((c) => c.startsWith("eb_refresh="));
}

function withoutRequestId(body: unknown): unknown {
  const entries = Object.entries(body as Record<string, unknown>).filter(([key]) => key !== "requestId");
  return Object.fromEntries(entries);
}

function cookieValue(setCookie: string): string {
  return setCookie.split(";")[0] ?? "";
}

describe("Auth and users (integration, real PostgreSQL)", () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    t = await createTestApp();
    http = request(t.app.getHttpServer() as App);
  });

  beforeEach(async () => {
    await resetData(t.prisma);
    t.mail.clearOutbox();
  });

  afterAll(async () => {
    await t.close();
  });

  async function registerVerifyLogin(email = uniqueEmail()) {
    await http.post("/api/v1/auth/register").send({ email, password: PASSWORD, firstName: "Layla", lastName: "Hassan" }).expect(202);
    await http.post("/api/v1/auth/verify-email").send({ token: tokenFromMail(t.mail, email) }).expect(200);
    const login = await http.post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(200);
    return { email, login, cookie: refreshCookieOf(login) as string };
  }

  describe("registration and email verification", () => {
    it("creates an unverified account and sends a single-use verification link", async () => {
      const email = uniqueEmail();
      await http.post("/api/v1/auth/register").send({ email, password: PASSWORD, firstName: "Layla", lastName: "Hassan" }).expect(202);

      const user = await t.prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user.emailVerifiedAt).toBeNull();
      expect(user.passwordHash.startsWith("$argon2id$")).toBe(true);
      expect(user.passwordHash).not.toContain(PASSWORD);

      const token = tokenFromMail(t.mail, email);
      await http.post("/api/v1/auth/verify-email").send({ token }).expect(200);
      const reused = await http.post("/api/v1/auth/verify-email").send({ token }).expect(400);
      expect(reused.body.code).toBe("INVALID_OR_EXPIRED_TOKEN");
    });

    it("answers the same way for an existing email and creates no second account", async () => {
      const email = uniqueEmail();
      await http.post("/api/v1/auth/register").send({ email, password: PASSWORD, firstName: "A", lastName: "B" }).expect(202);
      const again = await http.post("/api/v1/auth/register").send({ email, password: "another-password-1", firstName: "C", lastName: "D" }).expect(202);
      expect(again.body).toEqual({ status: "verification_sent" });
      expect(await t.prisma.user.count({ where: { email } })).toBe(1);
      expect(t.mail.outbox().some((m) => m.to === email && m.text.includes("tried to register"))).toBe(true);
    });

    it("rejects weak passwords and unknown fields with field-level errors", async () => {
      const weak = await http.post("/api/v1/auth/register").send({ email: uniqueEmail(), password: "short", firstName: "A", lastName: "B" }).expect(422);
      expect(weak.body.code).toBe("VALIDATION_FAILED");
      expect(weak.body.errors.map((e: { field: string }) => e.field)).toContain("password");

      const extra = await http
        .post("/api/v1/auth/register")
        .send({ email: uniqueEmail(), password: PASSWORD, firstName: "A", lastName: "B", role: "ADMIN" })
        .expect(422);
      expect(extra.body.errors[0].field).toBe("role");
    });
  });

  describe("sign in", () => {
    it("refuses unverified accounts after the password is proven correct", async () => {
      const email = uniqueEmail();
      await http.post("/api/v1/auth/register").send({ email, password: PASSWORD, firstName: "A", lastName: "B" }).expect(202);
      const res = await http.post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(403);
      expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");
    });

    it("returns an identical response for unknown email and wrong password", async () => {
      const { email } = await registerVerifyLogin();
      const wrongPassword = await http.post("/api/v1/auth/login").send({ email, password: "wrong-password-1" }).expect(401);
      const unknown = await http.post("/api/v1/auth/login").send({ email: uniqueEmail(), password: "wrong-password-1" }).expect(401);
      expect(wrongPassword.body.code).toBe("INVALID_CREDENTIALS");
      expect(withoutRequestId(unknown.body)).toEqual(withoutRequestId(wrongPassword.body));
    });

    it("issues a short-lived access token and an HttpOnly, SameSite=Strict refresh cookie", async () => {
      const { login, cookie } = await registerVerifyLogin();
      expect(login.body.accessToken.split(".")).toHaveLength(3);
      expect(login.body.expiresIn).toBe(600);
      expect(login.body.user).not.toHaveProperty("passwordHash");
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toContain("Path=/api/v1/auth");
      expect(login.body.refreshToken).toBeUndefined();
    });

    it("locks the account after repeated failures, even for the correct password", async () => {
      const { email } = await registerVerifyLogin();
      for (let i = 0; i < 5; i++) {
        await http.post("/api/v1/auth/login").send({ email, password: "wrong-password-1" }).expect(401);
      }
      const locked = await http.post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(403);
      expect(locked.body.code).toBe("ACCOUNT_LOCKED");
      const row = await t.prisma.user.findUniqueOrThrow({ where: { email } });
      expect(row.lockedUntil?.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe("protected routes", () => {
    it("requires a valid bearer token and returns the caller's profile", async () => {
      const { login } = await registerVerifyLogin();
      await http.get("/api/v1/users/me").expect(401);
      await http.get("/api/v1/users/me").set("Authorization", "Bearer not-a-token").expect(401);
      const me = await http.get("/api/v1/users/me").set("Authorization", `Bearer ${login.body.accessToken as string}`).expect(200);
      expect(me.body).toMatchObject({ firstName: "Layla", lastName: "Hassan", emailVerified: true, role: "CUSTOMER" });
    });

    it("updates the profile and preferences, validating each field", async () => {
      const { login } = await registerVerifyLogin();
      const auth = { Authorization: `Bearer ${login.body.accessToken as string}` };

      const updated = await http.patch("/api/v1/users/me").set(auth).send({ phone: "+201001234567", countryCode: "EG" }).expect(200);
      expect(updated.body).toMatchObject({ phone: "+201001234567", countryCode: "EG" });

      await http.patch("/api/v1/users/me").set(auth).send({ phone: "0100" }).expect(422);
      const prefs = await http.patch("/api/v1/users/me/preferences").set(auth).send({ currency: "USD", language: "AR" }).expect(200);
      expect(prefs.body).toMatchObject({ currency: "USD", language: "AR" });
      await http.patch("/api/v1/users/me/preferences").set(auth).send({ currency: "dollars" }).expect(422);
    });
  });

  describe("sessions: refresh, logout and revocation", () => {
    it("rotates the refresh token on every refresh", async () => {
      const { cookie } = await registerVerifyLogin();
      const refreshed = await http.post("/api/v1/auth/refresh").set("Cookie", cookieValue(cookie)).expect(200);
      expect(refreshed.body.accessToken).toBeDefined();
      const next = refreshCookieOf(refreshed);
      expect(next).toBeDefined();
      expect(next).not.toBe(cookie);
    });

    it("treats reuse of a rotated refresh token as theft and revokes the whole session", async () => {
      const { cookie } = await registerVerifyLogin();
      const first = await http.post("/api/v1/auth/refresh").set("Cookie", cookieValue(cookie)).expect(200);
      const newCookie = cookieValue(refreshCookieOf(first) as string);

      // The old token is presented again.
      const replay = await http.post("/api/v1/auth/refresh").set("Cookie", cookieValue(cookie)).expect(401);
      expect(replay.body.code).toBe("INVALID_REFRESH_TOKEN");

      // The newer token from the same family is now dead too.
      await http.post("/api/v1/auth/refresh").set("Cookie", newCookie).expect(401);
    });

    it("ends the session on logout: refresh and the old access token both stop working", async () => {
      const { login, cookie } = await registerVerifyLogin();
      await http.post("/api/v1/auth/logout").set("Cookie", cookieValue(cookie)).expect(204);
      await http.post("/api/v1/auth/refresh").set("Cookie", cookieValue(cookie)).expect(401);
      await http.get("/api/v1/users/me").set("Authorization", `Bearer ${login.body.accessToken as string}`).expect(401);
    });

    it("logout-all ends every session of the user", async () => {
      const email = uniqueEmail();
      const first = await registerVerifyLogin(email);
      const second = await http.post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(200);
      await http.post("/api/v1/auth/logout-all").set("Authorization", `Bearer ${second.body.accessToken as string}`).expect(204);
      await http.post("/api/v1/auth/refresh").set("Cookie", cookieValue(first.cookie)).expect(401);
      await http.post("/api/v1/auth/refresh").set("Cookie", cookieValue(refreshCookieOf(second) as string)).expect(401);
    });
  });

  describe("password reset and change", () => {
    it("does not reveal whether an account exists", async () => {
      await http.post("/api/v1/auth/forgot-password").send({ email: uniqueEmail() }).expect(202);
      expect(t.mail.outbox()).toHaveLength(0);
    });

    it("resets the password once, then ends existing sessions", async () => {
      const { email, cookie } = await registerVerifyLogin();
      await http.post("/api/v1/auth/forgot-password").send({ email }).expect(202);
      const token = tokenFromMail(t.mail, email);
      const newPassword = "brand-new-passphrase";

      await http.post("/api/v1/auth/reset-password").send({ token, newPassword }).expect(204);
      await http.post("/api/v1/auth/reset-password").send({ token, newPassword: "another-passphrase" }).expect(400);
      await http.post("/api/v1/auth/refresh").set("Cookie", cookieValue(cookie)).expect(401);
      await http.post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(401);
      await http.post("/api/v1/auth/login").send({ email, password: newPassword }).expect(200);
    });

    it("changes the password for the caller and keeps the current session alive", async () => {
      const email = uniqueEmail();
      const first = await registerVerifyLogin(email);
      const second = await http.post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(200);
      const auth = { Authorization: `Bearer ${first.login.body.accessToken as string}` };

      await http.put("/api/v1/users/me/password").set(auth).send({ currentPassword: "wrong-current-1", newPassword: "fresh-passphrase-2" }).expect(422);
      await http.put("/api/v1/users/me/password").set(auth).send({ currentPassword: PASSWORD, newPassword: "fresh-passphrase-2" }).expect(204);

      // Current session still works, the other session is ended.
      await http.get("/api/v1/users/me").set(auth).expect(200);
      await http.post("/api/v1/auth/refresh").set("Cookie", cookieValue(refreshCookieOf(second) as string)).expect(401);
    });
  });

  describe("audit trail", () => {
    it("records actor context that stays readable after the account is deleted", async () => {
      const { email, login } = await registerVerifyLogin();
      const userId = login.body.user.id as string;

      const before = await t.prisma.auditEvent.findFirst({
        where: { aggregateType: "User", aggregateId: userId, action: "auth.login_succeeded" },
      });
      expect(before).toMatchObject({ actorType: "USER", actorId: userId, actorEmail: email, actorRole: "CUSTOMER" });

      // Hard-delete the account. Audit rows have no foreign key and must survive.
      await t.prisma.user.delete({ where: { id: userId } });
      const after = await t.prisma.auditEvent.findFirst({ where: { id: before!.id } });
      expect(after).toMatchObject({ actorId: userId, actorEmail: email, actorRole: "CUSTOMER", action: "auth.login_succeeded" });
    });

    it("records failed sign-ins for unknown emails without storing the attempted address", async () => {
      const attempted = uniqueEmail();
      await http.post("/api/v1/auth/login").send({ email: attempted, password: "wrong-password-1" }).expect(401);
      const row = await t.prisma.auditEvent.findFirst({
        where: { action: "auth.login_failed", aggregateId: "unknown", actorEmail: null },
        orderBy: { id: "desc" },
      });
      expect(row).not.toBeNull();
      expect(JSON.stringify(row, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v))).not.toContain(attempted);
    });
  });

  describe("routing and errors", () => {
    it("returns RFC 9457 problem details for unknown routes", async () => {
      const res = await http.get("/api/v1/does-not-exist").expect(404);
      expect(res.headers["content-type"]).toContain("application/problem+json");
      expect(res.body).toMatchObject({ status: 404, code: "NOT_FOUND" });
      expect(res.headers["x-request-id"]).toBeDefined();
    });
  });
});
