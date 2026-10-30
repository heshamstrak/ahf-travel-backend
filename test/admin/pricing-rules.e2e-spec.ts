import { randomUUID } from "crypto";
import { createTestApp, TestApp } from "../support/app";
import { loadCatalogue } from "../catalogue/support";
import { ADMIN, api, asAdmin, createAdmin, createUser, signIn } from "./support";

describe("Admin pricing rules (integration)", () => {
  let t: TestApp;
  let adminToken: string;
  let customerToken: string;

  beforeAll(async () => {
    t = await createTestApp();
    await loadCatalogue(t.prisma);
    adminToken = await signIn(t, await createAdmin(t, "pricing-admin"));
    customerToken = await signIn(t, await createUser(t.prisma, "pricing-customer"));
  });

  afterAll(async () => {
    // Every rule this file creates applies to ALL products (no productType) unless a test deletes
    // it itself — left behind, an active all-products TAX/FEE row would silently inflate every
    // quote-calculation test in the rest of the suite (quotes.repository.ts's activeRules() reads
    // the real, shared PricingRule table with no awareness of what's "test data").
    await t.prisma.pricingRule.deleteMany({ where: { code: { startsWith: "test-rule-" } } });
    await t.close();
  });

  const a = () => asAdmin(t, adminToken);
  const code = () => `test-rule-${randomUUID().slice(0, 8)}`;

  it("rejects a non-admin caller on every route", async () => {
    const list = await api(t).get(`${ADMIN}/pricing-rules`).set("Authorization", `Bearer ${customerToken}`);
    expect(list.status).toBe(403);
    const create = await api(t)
      .post(`${ADMIN}/pricing-rules`)
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ code: code(), kind: "TAX", label: "x", percent: 0.1, validFrom: "2026-01-01" });
    expect(create.status).toBe(403);
  });

  it("creates a percent-based rule as DRAFT-equivalent (isActive true by default) and lists it", async () => {
    const c = code();
    const created = await a().post(`${ADMIN}/pricing-rules`).send({
      code: c,
      kind: "FEE",
      label: "Test platform fee",
      percent: 0.025,
      validFrom: "2026-01-01",
    });
    expect(created.status).toBe(201);
    expect(created.body.isActive).toBe(true);
    expect(created.body.percent).toBe("0.025");

    const list = await a().get(`${ADMIN}/pricing-rules`).query({ kind: "FEE", pageSize: 50 });
    expect(list.status).toBe(200);
    expect(list.body.items.some((r: { code: string }) => r.code === c)).toBe(true);
  });

  it("rejects a rule with neither percent nor flatAmount", async () => {
    const res = await a().post(`${ADMIN}/pricing-rules`).send({ code: code(), kind: "TAX", label: "Bad rule", validFrom: "2026-01-01" });
    expect(res.status).toBe(422);
  });

  it("rejects a flatAmount rule missing its currency", async () => {
    const res = await a().post(`${ADMIN}/pricing-rules`).send({ code: code(), kind: "SURCHARGE", label: "Bad rule", flatAmount: 100, validFrom: "2026-01-01" });
    expect(res.status).toBe(422);
  });

  it("rejects a validTo before validFrom", async () => {
    const res = await a().post(`${ADMIN}/pricing-rules`).send({ code: code(), kind: "TAX", label: "Bad window", percent: 0.1, validFrom: "2026-06-01", validTo: "2026-01-01" });
    expect(res.status).toBe(422);
  });

  it("rejects a duplicate code", async () => {
    const c = code();
    await a().post(`${ADMIN}/pricing-rules`).send({ code: c, kind: "TAX", label: "First", percent: 0.1, validFrom: "2026-01-01" });
    const dup = await a().post(`${ADMIN}/pricing-rules`).send({ code: c, kind: "TAX", label: "Second", percent: 0.2, validFrom: "2026-01-01" });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("CODE_TAKEN");
  });

  it("creates a flat-amount rule scoped to one product type, updates it, deactivates it, then deletes it", async () => {
    const c = code();
    const created = await a().post(`${ADMIN}/pricing-rules`).send({
      code: c,
      kind: "SURCHARGE",
      label: "Test young driver surcharge",
      productType: "CAR",
      flatAmount: 100,
      flatCurrency: "egp",
      conditions: { driverAgeBelow: 25 },
      validFrom: "2026-01-01",
    });
    expect(created.status).toBe(201);
    expect(created.body.flatCurrency).toBe("EGP");
    const id = created.body.id;

    const updated = await a().patch(`${ADMIN}/pricing-rules/${id}`).send({ flatAmount: 150 });
    expect(updated.status).toBe(200);
    expect(updated.body.flatAmount).toBe("150");

    const deactivated = await a().patch(`${ADMIN}/pricing-rules/${id}`).send({ isActive: false });
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.isActive).toBe(false);

    const del = await a().delete(`${ADMIN}/pricing-rules/${id}`);
    expect(del.status).toBe(204);

    const after = await a().get(`${ADMIN}/pricing-rules/${id}`);
    expect(after.status).toBe(404);
  });

  it("filters by isActive and by productType", async () => {
    const res = await a().get(`${ADMIN}/pricing-rules`).query({ productType: "CAR", isActive: true, pageSize: 50 });
    expect(res.status).toBe(200);
    expect(res.body.items.every((r: { productType: string | null }) => r.productType === "CAR")).toBe(true);
  });
});
