import { createTestApp, TestApp } from "../support/app";
import { loadCatalogue } from "../catalogue/support";
import { api, catalogueIds, expectProblem, isoDay, QUOTES } from "./support";
import { randomUUID } from "crypto";

/** Hotel quotes: exact arithmetic per rate plan, occupancy, rate overrides, rounding and refusals. */
describe("Hotel quotes (integration)", () => {
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

  const stayBody = (overrides: Record<string, unknown> = {}, rate = ids?.flexPyramidRate.id) => ({
    productType: "HOTEL",
    productId: rate,
    selection: { checkIn: isoDay(20), checkOut: isoDay(22), rooms: 1, adults: 2, children: 0, ...overrides },
  });

  const lineSummary = (quote: unknown) =>
    (quote as { lines: { kind: string; code: string; amount: string }[] }).lines.map(
      (line) => `${line.kind}:${line.code}:${line.amount}`,
    );

  it("prices two nights with the platform fee and VAT as separate lines that add up", async () => {
    const res = await api(t).post(QUOTES).send(stayBody()).expect(201);
    expect(res.body).toMatchObject({
      productType: "HOTEL",
      status: "ACTIVE",
      currency: "EGP",
      holdMinutes: 15,
      totals: { subtotal: "13600.00", discount: "0.00", surcharge: "0.00", fee: "408.00", tax: "1904.00", total: "15912.00", currency: "EGP" },
    });
    expect(lineSummary(res.body)).toEqual([
      "BASE:ROOM:13600.00",
      "FEE:platform-fee:408.00",
      "TAX:vat-eg:1904.00",
    ]);
    const vat = res.body.lines.find((line: { code: string }) => line.code === "vat-eg");
    expect(vat).toMatchObject({ rate: "0.1400", rule: { code: "vat-eg", kind: "TAX", version: expect.any(String) } });
    expect(vat.rule).not.toHaveProperty("id");
  });

  it("applies the long-stay discount from seven nights, then fee and VAT on the net", async () => {
    // 7 x 6800 = 47600. Discount 5% = 2380. Net 45220. Fee 3% = 1356.60. VAT 14% = 6330.80. Total 52907.40.
    const res = await api(t).post(QUOTES).send(stayBody({ checkOut: isoDay(27) })).expect(201);
    expect(res.body.totals).toMatchObject({ subtotal: "47600.00", discount: "2380.00", fee: "1356.60", tax: "6330.80", total: "52907.40" });
    expect(lineSummary(res.body)).toContain("DISCOUNT:long-stay-discount:2380.00");
  });

  it("prices a non-refundable rate with the same rules", async () => {
    // 2 x 5200 = 10400. Fee 312.00. VAT 1456.00. Total 12168.00.
    const res = await api(t).post(QUOTES).send(stayBody({}, ids.nonRefundableTwinRate.id)).expect(201);
    expect(res.body.totals).toMatchObject({ subtotal: "10400.00", fee: "312.00", tax: "1456.00", total: "12168.00" });
    expect(res.body.product.ratePlan).toMatchObject({ code: "NRF", isRefundable: false });
  });

  it("uses a RoomRate override for a night and the base rate for the rest", async () => {
    const night = isoDay(21);
    await t.prisma.roomRate.create({
      data: { ratePlanId: ids.flexPyramidRate.id, date: new Date(`${night}T00:00:00Z`), currency: "EGP", pricePerNight: 7000 },
    });
    try {
      // 6800 + 7000 = 13800. Fee 414.00. VAT 1932.00. Total 16146.00.
      const res = await api(t).post(QUOTES).send(stayBody()).expect(201);
      expect(res.body.totals).toMatchObject({ subtotal: "13800.00", fee: "414.00", tax: "1932.00", total: "16146.00" });
    } finally {
      await t.prisma.roomRate.delete({
        where: { ratePlanId_date: { ratePlanId: ids.flexPyramidRate.id, date: new Date(`${night}T00:00:00Z`) } },
      });
    }
  });

  it("rounds each line once, at the half-piastre boundary", async () => {
    const night = isoDay(21);
    await t.prisma.roomRate.create({
      data: { ratePlanId: ids.flexPyramidRate.id, date: new Date(`${night}T00:00:00Z`), currency: "EGP", pricePerNight: 6800.01 },
    });
    try {
      // Base 6800.00 + 6800.01 = 13600.01. Fee 3% = 408.0003 -> 408.00. VAT 14% = 1904.0014 -> 1904.00.
      const res = await api(t).post(QUOTES).send(stayBody()).expect(201);
      expect(res.body.totals).toMatchObject({ subtotal: "13600.01", fee: "408.00", tax: "1904.00", total: "15912.01" });
    } finally {
      await t.prisma.roomRate.delete({
        where: { ratePlanId_date: { ratePlanId: ids.flexPyramidRate.id, date: new Date(`${night}T00:00:00Z`) } },
      });
    }
  });

  it("refuses a party the room cannot hold, and extra people with no extra rate", async () => {
    // The Pyramid room holds two adults and no children.
    const three = await api(t).post(QUOTES).send(stayBody({ adults: 3 })).expect(422);
    expect(three.body.code).toBe("PARTY_NOT_ALLOWED");
    expectProblem(await api(t).post(QUOTES).send(stayBody({ children: 1 })), 422, "PARTY_NOT_ALLOWED");
  });

  it("rejects a past check-in, a non-positive stay and a stay longer than the maximum", async () => {
    const past = await api(t).post(QUOTES).send(stayBody({ checkIn: isoDay(-1), checkOut: isoDay(1) })).expect(422);
    expect(past.body.errors).toEqual([{ field: "checkIn", message: "must not be in the past" }]);
    expectProblem(await api(t).post(QUOTES).send(stayBody({ checkOut: isoDay(20) })), 422, "VALIDATION_FAILED");
    expectProblem(await api(t).post(QUOTES).send(stayBody({ checkOut: isoDay(19) })), 422, "VALIDATION_FAILED");
    expectProblem(await api(t).post(QUOTES).send(stayBody({ checkOut: isoDay(52) })), 422, "VALIDATION_FAILED");
  });

  it("refuses zero and negative guest quantities", async () => {
    for (const bad of [{ adults: 0 }, { children: -1 }, { rooms: 0 }, { rooms: 7 }]) {
      expectProblem(await api(t).post(QUOTES).send(stayBody(bad)), 422, "VALIDATION_FAILED");
    }
  });

  it("does not quote unpublished or unsellable rates", async () => {
    expectProblem(await api(t).post(QUOTES).send(stayBody({}, ids.hiddenDraftRate.id)), 404, "NOT_FOUND");
    expectProblem(await api(t).post(QUOTES).send(stayBody({}, ids.hiddenUnsellableRate.id)), 404, "NOT_FOUND");
    expectProblem(await api(t).post(QUOTES).send(stayBody({}, randomUUID())), 404, "NOT_FOUND");
  });

  it("refuses nights that are not in the sellable inventory window", async () => {
    // Inventory is seeded for 60 days. Ninety days out has no rows, so the night is not sold.
    const res = await api(t)
      .post(QUOTES)
      .send(stayBody({ checkIn: isoDay(90), checkOut: isoDay(91) }))
      .expect(409);
    expect(res.body.code).toBe("NOT_AVAILABLE");
  });

  it("refuses a stay on a night with no rooms left, without changing the counters", async () => {
    const night = new Date(`${isoDay(23)}T00:00:00Z`);
    const before = await t.prisma.roomInventory.findFirstOrThrow({ where: { roomId: ids.flexPyramidRate.roomId, date: night } });
    await t.prisma.roomInventory.update({
      where: { roomId_date: { roomId: ids.flexPyramidRate.roomId, date: night } },
      data: { soldUnits: before.totalUnits },
    });
    try {
      const res = await api(t).post(QUOTES).send(stayBody({ checkIn: isoDay(22), checkOut: isoDay(24) })).expect(409);
      expect(res.body.code).toBe("NOT_AVAILABLE");
    } finally {
      await t.prisma.roomInventory.update({
        where: { roomId_date: { roomId: ids.flexPyramidRate.roomId, date: night } },
        data: { soldUnits: before.soldUnits },
      });
    }
    // The refusal changed nothing: the counters are back where they were.
    const after = await t.prisma.roomInventory.findFirstOrThrow({ where: { roomId: ids.flexPyramidRate.roomId, date: night } });
    expect(after.soldUnits).toBe(before.soldUnits);
  });

  it("returns a guest token once and hides internal fields from the response", async () => {
    const res = await api(t).post(QUOTES).send(stayBody()).expect(201);
    expect(typeof res.body.guestToken).toBe("string");
    const json = JSON.stringify(res.body);
    for (const forbidden of ["userId", "guestTokenHash", "passwordHash", "storageKey", "isDevPlaceholder", "\"id\":\"id-"]) {
      expect(json).not.toContain(forbidden);
    }
  });
});
