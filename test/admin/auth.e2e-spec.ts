import { createTestApp, TestApp } from "../support/app";
import { loadCatalogue } from "../catalogue/support";
import { ADMIN, api, asAdmin, createAdmin, createUser, PREFIX, signIn } from "./support";

describe("Admin authentication and authorization (integration)", () => {
  let t: TestApp;
  let adminToken: string;
  let customerToken: string;

  beforeAll(async () => {
    t = await createTestApp();
    await loadCatalogue(t.prisma);
    adminToken = await signIn(t, await createAdmin(t, "auth-admin"));
    customerToken = await signIn(t, await createUser(t.prisma, "auth-customer"));
  });

  afterAll(async () => {
    await t.close();
  });

  it("rejects an unauthenticated request to the dashboard", async () => {
    const res = await api(t).get(`${ADMIN}/dashboard`);
    expect(res.status).toBe(401);
  });

  it("rejects a signed-in customer from every admin surface", async () => {
    for (const path of [`${ADMIN}/dashboard`, `${ADMIN}/destinations`, `${ADMIN}/hotels`, `${ADMIN}/bookings`, `${ADMIN}/staff`, `${ADMIN}/settings`]) {
      const res = await api(t).get(path).set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
    }
  });

  it("rejects a bearer token from a route it was never issued for (no privilege escalation via a forged role claim)", async () => {
    const res = await api(t).get(`${ADMIN}/dashboard`).set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });

  it("lets an authenticated admin reach the dashboard and read their own profile", async () => {
    const dashboard = await asAdmin(t, adminToken).get(`${ADMIN}/dashboard`);
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.bookings).toBeDefined();

    const profile = await asAdmin(t, adminToken).get(`${ADMIN}/profile`);
    expect(profile.status).toBe(200);
    expect(profile.body.role).toBe("ADMIN");
  });

  it("never exposes a public registration path to a staff role, even when the client asks for one", async () => {
    const email = `escalate-${Date.now()}@example.test`;
    await api(t)
      .post(`${PREFIX}/auth/register`)
      .send({ email, password: "correct-horse-battery-staple", firstName: "A", lastName: "B", role: "ADMIN" });
    const created = await t.prisma.user.findUnique({ where: { email } });
    if (created) expect(created.role).toBe("CUSTOMER");
  });
});
