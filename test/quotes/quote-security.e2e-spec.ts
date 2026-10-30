import { randomUUID } from "crypto";
import { createTestApp, TestApp } from "../support/app";
import { Clock } from "../../src/common/clock";
import { loadCatalogue } from "../catalogue/support";
import { api, catalogueIds, createUser, expectProblem, isoDay, QUOTES, signIn } from "./support";

/**
 * Quote security and integrity: ownership, guest tokens, expiry, immutability, rule changes after
 * creation, tampering, determinism and display currency.
 */
describe("Quote security and integrity (integration)", () => {
  let t: TestApp;
  let ids: Awaited<ReturnType<typeof catalogueIds>>;

  beforeAll(async () => {
    t = await createTestApp();
    await loadCatalogue(t.prisma);
    ids = await catalogueIds(t.prisma);
  });

  afterAll(async () => {
    t.app.get(Clock).reset();
    await t.close();
  });

  const hotelBody = (overrides: Record<string, unknown> = {}) => ({
    productType: "HOTEL",
    productId: ids.flexPyramidRate.id,
    selection: { checkIn: isoDay(20), checkOut: isoDay(22), rooms: 1, adults: 2, children: 0, ...overrides },
  });

  describe("ownership", () => {
    it("records the signed-in owner and returns the quote only to that user", async () => {
      const owner = await createUser(t.prisma, "owner");
      const other = await createUser(t.prisma, "other");
      const ownerToken = await signIn(t, owner);
      const otherToken = await signIn(t, other);

      const created = await api(t).post(QUOTES).set("Authorization", `Bearer ${ownerToken}`).send(hotelBody()).expect(201);
      expect(created.body.guestToken).toBeUndefined();
      const row = await t.prisma.quote.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(row.userId).toBe(owner.id);

      await api(t).get(`${QUOTES}/${created.body.id}`).set("Authorization", `Bearer ${ownerToken}`).expect(200);
      // Another user, and an anonymous caller, both get 404 rather than 403, so ids cannot be probed.
      expectProblem(await api(t).get(`${QUOTES}/${created.body.id}`).set("Authorization", `Bearer ${otherToken}`), 404, "NOT_FOUND");
      expectProblem(await api(t).get(`${QUOTES}/${created.body.id}`), 404, "NOT_FOUND");
    });

    it("gives a guest a token once, and requires it on every read", async () => {
      const created = await api(t).post(QUOTES).send(hotelBody()).expect(201);
      const token = created.body.guestToken as string;
      expect(token.length).toBeGreaterThanOrEqual(40);
      const row = await t.prisma.quote.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(row.userId).toBeNull();
      expect(row.guestTokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.guestTokenHash).not.toContain(token);

      await api(t).get(`${QUOTES}/${created.body.id}`).set("X-Quote-Token", token).expect(200);
      expectProblem(await api(t).get(`${QUOTES}/${created.body.id}`), 404, "NOT_FOUND");
      expectProblem(await api(t).get(`${QUOTES}/${created.body.id}`).set("X-Quote-Token", "wrong-token"), 404, "NOT_FOUND");
    });

    it("does not let a signed-in user read a guest quote without its token", async () => {
      const user = await createUser(t.prisma, "signed");
      const token = await signIn(t, user);
      const guest = await api(t).post(QUOTES).send(hotelBody()).expect(201);
      expectProblem(await api(t).get(`${QUOTES}/${guest.body.id}`).set("Authorization", `Bearer ${token}`), 404, "NOT_FOUND");
    });

    it("rejects a malformed quote id with 422 and an unknown id with 404", async () => {
      expectProblem(await api(t).get(`${QUOTES}/not-a-uuid`), 422, "VALIDATION_FAILED");
      expectProblem(await api(t).get(`${QUOTES}/${randomUUID()}`), 404, "NOT_FOUND");
    });

    it("rejects an invalid bearer token even on a route that accepts guests", async () => {
      const res = await api(t).post(QUOTES).set("Authorization", "Bearer not.a.real.token").send(hotelBody());
      expect(res.status).toBe(401);
    });
  });

  describe("expiry", () => {
    it("reports EXPIRED once the TTL has passed, using the quote's own expiry instant", async () => {
      const clock = t.app.get(Clock);
      const quote = (await api(t).post(QUOTES).send(hotelBody()).expect(201)).body;
      try {
        expect(new Date(quote.expiresAt as string).getTime() - new Date(quote.createdAt as string).getTime()).toBe(15 * 60_000);
        clock.advance(14 * 60_000);
        const active = await api(t).get(`${QUOTES}/${quote.id}`).set("X-Quote-Token", quote.guestToken as string).expect(200);
        expect(active.body.status).toBe("ACTIVE");
        clock.advance(2 * 60_000);
        const expired = await api(t).get(`${QUOTES}/${quote.id}`).set("X-Quote-Token", quote.guestToken as string).expect(200);
        expect(expired.body.status).toBe("EXPIRED");
        // An expired quote still explains its totals. Expiry does not rewrite history.
        expect(expired.body.totals.total).toBe(quote.totals.total);
      } finally {
        clock.reset();
      }
    });
  });

  describe("immutability", () => {
    it("refuses to change or delete a stored quote, and refuses to truncate the table", async () => {
      const created = await api(t).post(QUOTES).send(hotelBody()).expect(201);
      await expect(t.prisma.quote.update({ where: { id: created.body.id }, data: { total: 1 } })).rejects.toThrow(/immutable/);
      await expect(t.prisma.quote.update({ where: { id: created.body.id }, data: { currency: "USD" } })).rejects.toThrow(/immutable/);
      await expect(t.prisma.quote.delete({ where: { id: created.body.id } })).rejects.toThrow(/immutable/);
      // TRUNCATE is refused. The foreign key from Booking blocks it before the trigger, and the trigger is the backstop.
      const before = await t.prisma.quote.count();
      await expect(t.prisma.$executeRawUnsafe(`TRUNCATE "Quote"`)).rejects.toThrow();
      expect(await t.prisma.quote.count()).toBe(before);
    });

    it("allows exactly one change: consumedAt going from empty to a timestamp", async () => {
      const created = await api(t).post(QUOTES).send(hotelBody()).expect(201);
      const consumed = await t.prisma.quote.update({ where: { id: created.body.id }, data: { consumedAt: new Date() } });
      expect(consumed.consumedAt).not.toBeNull();
      await expect(t.prisma.quote.update({ where: { id: created.body.id }, data: { consumedAt: null } })).rejects.toThrow(/immutable/);
    });
  });

  describe("pricing rules that change after a quote", () => {
    it("keeps the old quote's totals and rule version, while new quotes use the new rule", async () => {
      const rule = await t.prisma.pricingRule.findUniqueOrThrow({ where: { code: "vat-eg" } });
      const before = await api(t).post(QUOTES).send(hotelBody()).expect(201);
      expect(before.body.totals.tax).toBe("1904.00");
      const oldVersion = before.body.lines.find((line: { code: string }) => line.code === "vat-eg").rule.version;

      await t.prisma.pricingRule.update({ where: { id: rule.id }, data: { percent: "0.2000" } });
      try {
        const stored = await api(t).get(`${QUOTES}/${before.body.id}`).set("X-Quote-Token", before.body.guestToken as string).expect(200);
        expect(stored.body.totals.tax).toBe("1904.00");
        expect(stored.body.lines.find((line: { code: string }) => line.code === "vat-eg").rule.version).toBe(oldVersion);

        // A new quote for the same stay uses 20%: 20% of 13600 = 2720. Fee 408. Total 16728.
        const after = await api(t).post(QUOTES).send(hotelBody()).expect(201);
        expect(after.body.totals).toMatchObject({ tax: "2720.00", total: "16728.00" });
      } finally {
        await t.prisma.pricingRule.update({ where: { id: rule.id }, data: { percent: "0.1400" } });
      }
    });
  });

  describe("tampering", () => {
    it("refuses any client-supplied money or ownership field at the top level", async () => {
      for (const extra of [
        { subtotal: "1.00" },
        { total: "1.00" },
        { tax: "0.00" },
        { fee: "0.00" },
        { discount: "100.00" },
        { currency: "USD" },
        { lines: [] },
        { userId: randomUUID() },
        { guestTokenHash: "x" },
      ]) {
        const res = await api(t).post(QUOTES).send({ ...hotelBody(), ...extra });
        expect(res.status).toBe(422);
        expect(res.body.code).toBe("VALIDATION_FAILED");
      }
    });

    it("refuses any price or total inside the selection", async () => {
      expectProblem(await api(t).post(QUOTES).send(hotelBody({ price: 1 })), 422, "VALIDATION_FAILED");
      expectProblem(await api(t).post(QUOTES).send(hotelBody({ nightlyRate: 1 })), 422, "VALIDATION_FAILED");
    });

    it("refuses an unknown product type, a malformed product id and a missing selection", async () => {
      expectProblem(await api(t).post(QUOTES).send({ ...hotelBody(), productType: "FLIGHT" }), 422, "VALIDATION_FAILED");
      expectProblem(await api(t).post(QUOTES).send({ ...hotelBody(), productId: "abc" }), 422, "VALIDATION_FAILED");
      expectProblem(
        await api(t).post(QUOTES).send({ productType: "HOTEL", productId: ids.flexPyramidRate.id }),
        422,
        "VALIDATION_FAILED",
      );
    });
  });

  describe("determinism and secrecy", () => {
    it("gives identical totals and line amounts for identical inputs", async () => {
      const a = await api(t).post(QUOTES).send(hotelBody({ checkOut: isoDay(27) })).expect(201);
      const b = await api(t).post(QUOTES).send(hotelBody({ checkOut: isoDay(27) })).expect(201);
      expect(b.body.id).not.toBe(a.body.id);
      expect(b.body.totals).toEqual(a.body.totals);
      const amounts = (quote: unknown) =>
        (quote as { lines: { code: string; amount: string }[] }).lines.map((line) => `${line.code}=${line.amount}`);
      expect(amounts(b.body)).toEqual(amounts(a.body));
    });

    it("never returns internal rule ids, owner ids or token hashes", async () => {
      const owner = await createUser(t.prisma, "secret");
      const token = await signIn(t, owner);
      const res = await api(t).post(QUOTES).set("Authorization", `Bearer ${token}`).send(hotelBody()).expect(201);
      const json = JSON.stringify(res.body);
      expect(json).not.toContain(owner.id);
      expect(json).not.toContain("guestTokenHash");
      for (const line of res.body.lines as { rule: object | null }[]) {
        expect(line.rule ? Object.keys(line.rule).sort() : null).toEqual(
          line.rule ? ["code", "flatAmount", "flatCurrency", "kind", "label", "percent", "version"] : null,
        );
      }
    });
  });

  describe("display currency", () => {
    it("converts the legal total at a snapshotted rate and rounds once", async () => {
      // 15912.00 EGP x 0.0205 = 326.196, which rounds to 326.20 USD.
      const res = await api(t).post(QUOTES).send({ ...hotelBody(), displayCurrency: "USD" }).expect(201);
      expect(res.body.totals.total).toBe("15912.00");
      expect(res.body.display).toEqual({ currency: "USD", rate: "0.0205", total: "326.20" });
    });

    it("converts into another configured currency with its own rate", async () => {
      // 15912.00 x 0.018 = 286.416, which rounds to 286.42 EUR.
      const res = await api(t).post(QUOTES).send({ ...hotelBody(), displayCurrency: "EUR" }).expect(201);
      expect(res.body.display).toMatchObject({ currency: "EUR", total: "286.42" });
    });

    it("refuses a display currency that is not configured, and omits display for the quote currency", async () => {
      const refused = await api(t).post(QUOTES).send({ ...hotelBody(), displayCurrency: "JPY" }).expect(422);
      expect(refused.body.code).toBe("CURRENCY_NOT_SUPPORTED");
      const same = await api(t).post(QUOTES).send({ ...hotelBody(), displayCurrency: "EGP" }).expect(201);
      expect(same.body.display).toBeNull();
    });
  });
});
