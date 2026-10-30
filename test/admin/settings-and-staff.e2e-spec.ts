import { createTestApp, TestApp } from "../support/app";
import { loadCatalogue } from "../catalogue/support";
import { ADMIN, api, asAdmin, createAdmin, createUser, PREFIX, signIn } from "./support";

describe("Admin settings and staff provisioning (integration)", () => {
  let t: TestApp;
  let adminToken: string;

  beforeAll(async () => {
    t = await createTestApp();
    await loadCatalogue(t.prisma);
    adminToken = await signIn(t, await createAdmin(t, "settings-admin"));
  });

  afterAll(async () => {
    await t.close();
  });

  const a = () => asAdmin(t, adminToken);

  describe("Settings", () => {
    it("lists only the allowlisted settings", async () => {
      const res = await a().get(`${ADMIN}/settings`);
      expect(res.status).toBe(200);
      const keys = res.body.map((s: { key: string }) => s.key);
      expect(keys).toContain("payment.instapay");
      expect(keys).not.toContain("JWT_PRIVATE_KEY_B64");
    });

    it("rejects writing a key that is not on the allowlist", async () => {
      const res = await a().patch(`${ADMIN}/settings/some.random.key`).send({ value: "anything" });
      expect(res.status).toBe(422);
    });

    it("rejects a value that does not match the setting's own shape", async () => {
      const res = await a().patch(`${ADMIN}/settings/booking.holdMinutes`).send({ value: "not-a-number" });
      expect(res.status).toBe(409);
    });

    it("updates the InstaPay instructions, and the public endpoint immediately reflects the change", async () => {
      const res = await a().patch(`${ADMIN}/settings/payment.instapay`).send({
        value: { recipientName: "New Recipient Name", handle: "01111111111", instructionsText: "Updated instructions." },
      });
      expect(res.status).toBe(200);

      const pub = await api(t).get(`${PREFIX}/payments/instapay-instructions`);
      expect(pub.status).toBe(200);
      expect(pub.body.recipientName).toBe("New Recipient Name");
    });

    it("rejects settings access from a non-admin", async () => {
      const customerToken = await signIn(t, await createUser(t.prisma, "settings-customer"));
      const res = await api(t).get(`${ADMIN}/settings`).set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe("Branding settings", () => {
    it("rejects a branding color that is not a hex string", async () => {
      const res = await a().patch(`${ADMIN}/settings/branding.theme`).send({ value: { primaryColor: "teal" } });
      expect(res.status).toBe(409);
    });

    it("updates site identity and header/theme/hero settings, and the public branding endpoint immediately reflects every change", async () => {
      const identity = await a().patch(`${ADMIN}/settings/branding.identity`).send({
        value: { siteName: "Test Travel Co", tagline: "Testing taglines", footerCopyright: "(c) Test Travel Co" },
      });
      expect(identity.status).toBe(200);

      const theme = await a().patch(`${ADMIN}/settings/branding.theme`).send({ value: { primaryColor: "#112233", buttonTextColor: "#ffffff" } });
      expect(theme.status).toBe(200);

      const hero = await a().patch(`${ADMIN}/settings/branding.hero`).send({ value: { title: "Test hero title", textAlign: "center" } });
      expect(hero.status).toBe(200);

      const pub = await api(t).get(`${PREFIX}/settings/branding`);
      expect(pub.status).toBe(200);
      expect(pub.body.identity.siteName).toBe("Test Travel Co");
      expect(pub.body.theme.primaryColor).toBe("#112233");
      expect(pub.body.hero.title).toBe("Test hero title");
      // Never leaks unrelated allowlisted settings through the branding-only public endpoint.
      expect(pub.body.payment).toBeUndefined();
      expect(pub.body["booking.holdMinutes"]).toBeUndefined();
    });

    it("rejects an unauthenticated write but allows the public branding read without any auth", async () => {
      const res = await api(t).patch(`${ADMIN}/settings/branding.identity`).send({ value: { siteName: "Hijacked" } });
      expect(res.status).toBe(401);

      const pub = await api(t).get(`${PREFIX}/settings/branding`);
      expect(pub.status).toBe(200);
    });
  });

  describe("Staff provisioning", () => {
    it("creates a new staff account, which can then sign in through the normal login endpoint", async () => {
      const email = `new-staff-${Date.now()}@example.test`;
      const created = await a().post(`${ADMIN}/staff`).send({ email, password: "correct-horse-battery-staple", firstName: "New", lastName: "Staff", role: "SUPPORT" });
      expect(created.status).toBe(201);
      expect(created.body.role).toBe("SUPPORT");

      const login = await api(t).post(`${PREFIX}/auth/login`).send({ email, password: "correct-horse-battery-staple" });
      expect(login.status).toBe(200);
      expect(login.body.user.role).toBe("SUPPORT");
    });

    it("rejects creating a staff account with a duplicate email", async () => {
      const email = `dup-staff-${Date.now()}@example.test`;
      await a().post(`${ADMIN}/staff`).send({ email, password: "correct-horse-battery-staple", firstName: "A", lastName: "B", role: "SUPPORT" }).expect(201);
      const res = await a().post(`${ADMIN}/staff`).send({ email, password: "correct-horse-battery-staple", firstName: "A", lastName: "B", role: "SUPPORT" });
      expect(res.status).toBe(409);
    });

    it("rejects a non-admin from provisioning staff", async () => {
      const customerToken = await signIn(t, await createUser(t.prisma, "staff-customer"));
      const res = await api(t)
        .post(`${ADMIN}/staff`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ email: `escalation-${Date.now()}@example.test`, password: "correct-horse-battery-staple", firstName: "A", lastName: "B", role: "ADMIN" });
      expect(res.status).toBe(403);
    });
  });
});
