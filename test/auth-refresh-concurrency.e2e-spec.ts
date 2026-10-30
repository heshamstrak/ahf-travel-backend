import request from "supertest";
import { randomUUID } from "crypto";
import type { App } from "supertest/types";
import { createTestApp, resetData, TestApp, tokenFromMail } from "./support/app";

const PASSWORD = "correct-horse-battery";
const ROUNDS = 5;

function cookieOf(res: request.Response): string {
  const cookies = (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
  const found = cookies.find((c) => c.startsWith("eb_refresh="));
  if (!found) throw new Error("no refresh cookie");
  return found.split(";")[0] ?? "";
}

describe("Refresh rotation under concurrency (real PostgreSQL)", () => {
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

  async function freshSession(): Promise<string> {
    const email = `race-${randomUUID().slice(0, 8)}@example.com`;
    await http.post("/api/v1/auth/register").send({ email, password: PASSWORD, firstName: "R", lastName: "C" }).expect(202);
    await http.post("/api/v1/auth/verify-email").send({ token: tokenFromMail(t.mail, email) }).expect(200);
    const login = await http.post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(200);
    return cookieOf(login);
  }

  it(`lets exactly one of two simultaneous refreshes succeed, in ${ROUNDS} of ${ROUNDS} rounds`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const cookie = await freshSession();

      const [a, b] = await Promise.all([
        http.post("/api/v1/auth/refresh").set("Cookie", cookie),
        http.post("/api/v1/auth/refresh").set("Cookie", cookie),
      ]);

      expect([a.status, b.status].sort()).toEqual([200, 401]);

      // The loser's rejection revokes the family, so the winner's freshly issued token is dead too.
      const winner = a.status === 200 ? a : b;
      await http.post("/api/v1/auth/refresh").set("Cookie", cookieOf(winner)).expect(401);
    }

    const reuseEvents = await t.prisma.auditEvent.count({ where: { action: "auth.refresh_reuse_detected" } });
    expect(reuseEvents).toBeGreaterThanOrEqual(ROUNDS);
  });

  it("never leaves two live refresh tokens in one family after a race", async () => {
    const cookie = await freshSession();
    await Promise.all([
      http.post("/api/v1/auth/refresh").set("Cookie", cookie),
      http.post("/api/v1/auth/refresh").set("Cookie", cookie),
    ]);
    const family = await t.prisma.authToken.findFirstOrThrow({
      where: { tokenHash: { not: "" }, type: "REFRESH", replacedById: null },
      orderBy: { createdAt: "desc" },
    });
    const liveTokens = await t.prisma.authToken.count({
      where: { familyId: family.familyId ?? "", type: "REFRESH", revokedAt: null },
    });
    expect(liveTokens).toBe(0);
  });
});
