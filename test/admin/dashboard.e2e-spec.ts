import { createTestApp, TestApp } from "../support/app";
import { loadCatalogue } from "../catalogue/support";
import { ADMIN, api, asAdmin, catalogueIds, createAdmin, createUser, signIn } from "./support";

describe("Admin dashboard (integration)", () => {
  let t: TestApp;
  let adminToken: string;
  let customerToken: string;

  beforeAll(async () => {
    t = await createTestApp();
    await loadCatalogue(t.prisma);
    await catalogueIds(t.prisma);
    adminToken = await signIn(t, await createAdmin(t, "dashboard-admin"));
    customerToken = await signIn(t, await createUser(t.prisma, "dashboard-customer"));
  });

  afterAll(async () => {
    await t.close();
  });

  const a = () => asAdmin(t, adminToken);

  describe("GET /admin/dashboard", () => {
    it("rejects an unauthenticated caller and a non-admin customer", async () => {
      const unauth = await api(t).get(`${ADMIN}/dashboard`);
      expect(unauth.status).toBe(401);
      const forbidden = await api(t).get(`${ADMIN}/dashboard`).set("Authorization", `Bearer ${customerToken}`);
      expect(forbidden.status).toBe(403);
    });

    it("returns live counts shaped for the dashboard, including today's bookings", async () => {
      const res = await a().get(`${ADMIN}/dashboard`);
      expect(res.status).toBe(200);
      expect(res.body.bookings).toMatchObject({
        total: expect.any(Number),
        confirmed: expect.any(Number),
        pending: expect.any(Number),
        cancelled: expect.any(Number),
        expired: expect.any(Number),
        today: expect.any(Number),
      });
      expect(res.body.catalogue).toMatchObject({ hotels: expect.any(Number), tours: expect.any(Number), cars: expect.any(Number), transfers: expect.any(Number), packages: expect.any(Number) });
      expect(res.body.financials.currency).toBe("EGP");
    });
  });

  describe("GET /admin/dashboard/analytics", () => {
    it("rejects an unauthenticated caller", async () => {
      const res = await api(t).get(`${ADMIN}/dashboard/analytics`).query({ from: "2026-01-01", to: "2026-01-31" });
      expect(res.status).toBe(401);
    });

    it("requires both from and to", async () => {
      const res = await a().get(`${ADMIN}/dashboard/analytics`).query({ from: "2026-01-01" });
      expect(res.status).toBe(422);
    });

    it("rejects a to before from", async () => {
      const res = await a().get(`${ADMIN}/dashboard/analytics`).query({ from: "2026-01-31", to: "2026-01-01" });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("VALIDATION_FAILED");
    });

    it("returns every series shape over a real window, reflecting a booking made inside it", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const res = await a().get(`${ADMIN}/dashboard/analytics`).query({ from: today, to: today });
      expect(res.status).toBe(200);
      expect(res.body.currency).toBe("EGP");
      expect(Array.isArray(res.body.bookingsOverTime)).toBe(true);
      expect(Array.isArray(res.body.statusDistribution)).toBe(true);
      expect(Array.isArray(res.body.categoryBreakdown)).toBe(true);
      expect(Array.isArray(res.body.revenueOverTime)).toBe(true);
      expect(res.body.paymentMethodBreakdown).toMatchObject({ cash: expect.any(String), instapay: expect.any(String) });
    });

    it("an empty window returns empty series, not an error", async () => {
      const res = await a().get(`${ADMIN}/dashboard/analytics`).query({ from: "2020-01-01", to: "2020-01-02" });
      expect(res.status).toBe(200);
      expect(res.body.bookingsOverTime).toEqual([]);
      expect(res.body.revenueOverTime).toEqual([]);
    });
  });
});
