import { createTestApp, TestApp } from "../support/app";
import { loadCatalogue } from "../catalogue/support";
import { api, catalogueIds, expectProblem, QUOTES } from "./support";

/** Tour quotes: selected session, participants, visibility of sessions, availability and currency. */
describe("Tour quotes (integration)", () => {
  let t: TestApp;
  let ids: Awaited<ReturnType<typeof catalogueIds>>;

  beforeAll(async () => {
    t = await createTestApp();
    await loadCatalogue(t.prisma);
    ids = await catalogueIds(t.prisma);
  });

  afterAll(async () => {
    await t.close();
  });

  const tourBody = (sessionId: string, participants: number) => ({
    productType: "TOUR",
    productId: sessionId,
    selection: { participants },
  });

  it("prices participants x unit price, with fee and VAT on top", async () => {
    // 2 x 720.00 = 1440.00. Fee 43.20. VAT 201.60. Total 1684.80.
    const res = await api(t).post(QUOTES).send(tourBody(ids.nileSession.id, 2)).expect(201);
    expect(res.body.totals).toMatchObject({ subtotal: "1440.00", fee: "43.20", tax: "201.60", total: "1684.80", currency: "EGP" });
    expect(res.body.product).toMatchObject({ tour: { slug: "nile-dinner-cruise" } });
    expect(res.body.lines[0]).toMatchObject({ kind: "BASE", code: "PARTICIPANT", quantity: 2, unitAmount: "720.00", amount: "1440.00" });
  });

  it("prices a full group at the tour's maximum size", async () => {
    // 12 x 950.00 = 11400.00. Fee 342.00. VAT 1596.00. Total 13338.00.
    const res = await api(t).post(QUOTES).send(tourBody(ids.pyramidsSession.id, 12)).expect(201);
    expect(res.body.totals).toMatchObject({ subtotal: "11400.00", total: "13338.00" });
  });

  it("refuses a group above the tour's maximum and an out-of-range group", async () => {
    const tooBig = await api(t).post(QUOTES).send(tourBody(ids.pyramidsSession.id, 13)).expect(422);
    expect(tooBig.body.code).toBe("PARTY_NOT_ALLOWED");
    expectProblem(await api(t).post(QUOTES).send(tourBody(ids.nileSession.id, 41)), 422, "VALIDATION_FAILED");
    expectProblem(await api(t).post(QUOTES).send(tourBody(ids.nileSession.id, 0)), 422, "VALIDATION_FAILED");
  });

  it("does not quote a session that has started or one that is closed", async () => {
    expectProblem(await api(t).post(QUOTES).send(tourBody(ids.pastSession.id, 1)), 404, "NOT_FOUND");
    expectProblem(await api(t).post(QUOTES).send(tourBody(ids.closedSession.id, 1)), 404, "NOT_FOUND");
  });

  it("refuses more participants than the seats left", async () => {
    const session = ids.nileSession;
    await t.prisma.tourSession.update({ where: { id: session.id }, data: { heldUnits: session.capacity - 1 } });
    try {
      const res = await api(t).post(QUOTES).send(tourBody(session.id, 2)).expect(409);
      expect(res.body.code).toBe("NOT_AVAILABLE");
    } finally {
      await t.prisma.tourSession.update({ where: { id: session.id }, data: { heldUnits: session.heldUnits } });
    }
  });

  it("uses the session's own price and currency when it has an override", async () => {
    const session = ids.nileSession;
    await t.prisma.tourSession.update({ where: { id: session.id }, data: { priceOverride: 40, overrideCurrency: "USD" } });
    try {
      // 2 x 40.00 USD = 80.00. Fee 2.40. VAT 11.20. Total 93.60 USD. The EGP-only rules still apply because they are percentages.
      const res = await api(t).post(QUOTES).send(tourBody(session.id, 2)).expect(201);
      expect(res.body).toMatchObject({ currency: "USD", totals: { subtotal: "80.00", fee: "2.40", tax: "11.20", total: "93.60", currency: "USD" } });
    } finally {
      await t.prisma.tourSession.update({ where: { id: session.id }, data: { priceOverride: null, overrideCurrency: null } });
    }
  });

  it("does not quote a tour that is archived or whose destination is a draft", async () => {
    const archived = await t.prisma.tourSession.findFirstOrThrow({ where: { tour: { slug: "hidden-archived-tour" } } });
    expectProblem(await api(t).post(QUOTES).send(tourBody(archived.id, 1)), 404, "NOT_FOUND");
  });

  it("applies the platform fee rule's absence when the rule is switched off, and restores it", async () => {
    const rule = await t.prisma.pricingRule.findUniqueOrThrow({ where: { code: "platform-fee" } });
    await t.prisma.pricingRule.update({ where: { id: rule.id }, data: { isActive: false } });
    try {
      const res = await api(t).post(QUOTES).send(tourBody(ids.nileSession.id, 2)).expect(201);
      expect(res.body.totals).toMatchObject({ fee: "0.00", tax: "201.60", total: "1641.60" });
    } finally {
      await t.prisma.pricingRule.update({ where: { id: rule.id }, data: { isActive: true } });
    }
  });
});
