import { createTestApp, TestApp } from "../support/app";
import { loadCatalogue } from "../catalogue/support";
import { api, catalogueIds, expectProblem, QUOTES } from "./support";

/** Package quotes: each pricing basis, supplements, group limits, departures and availability. */
describe("Package quotes (integration)", () => {
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

  const packageBody = (overrides: Record<string, unknown> = {}, departureId = ids?.cairoWeekendDeparture.id) => ({
    productType: "PACKAGE",
    productId: departureId,
    selection: { adults: 2, children: 0, ...overrides },
  });

  /** Changes the package's pricing terms for one test, and restores them afterwards. */
  async function withPackageTerms<T>(terms: Record<string, unknown>, body: () => Promise<T>): Promise<T> {
    const original = await t.prisma.package.findUniqueOrThrow({ where: { id: ids.cairoWeekend.id } });
    await t.prisma.package.update({ where: { id: original.id }, data: terms });
    try {
      return await body();
    } finally {
      await t.prisma.package.update({
        where: { id: original.id },
        data: {
          pricingBasis: original.pricingBasis,
          basePrice: original.basePrice,
          singleSupplement: original.singleSupplement,
          childPrice: original.childPrice,
          extraPersonPrice: original.extraPersonPrice,
          maxTravellers: original.maxTravellers,
        },
      });
    }
  }

  it("prices PER_PERSON: adults x base price, with fee and VAT on top", async () => {
    // 2 x 7200.00 = 14400.00. Fee 432.00. VAT 2016.00. Total 16848.00.
    const res = await api(t).post(QUOTES).send(packageBody()).expect(201);
    expect(res.body.totals).toMatchObject({ subtotal: "14400.00", fee: "432.00", tax: "2016.00", total: "16848.00" });
    expect(res.body.product.package).toMatchObject({ slug: "cairo-weekend", pricingBasis: "PER_PERSON" });
  });

  it("does not halve the starting price: one traveller pays the full base price", async () => {
    // One adult: 7200.00 only, because the Cairo Weekend has no single supplement. Fee 216.00. VAT 1008.00. Total 8424.00.
    const res = await api(t).post(QUOTES).send(packageBody({ adults: 1 })).expect(201);
    expect(res.body.totals).toMatchObject({ subtotal: "7200.00", total: "8424.00" });
  });

  it("adds a single-traveller supplement only when the package defines one", async () => {
    await withPackageTerms({ singleSupplement: "400.00" }, async () => {
      // 7200 + 400 supplement = 7600. Fee 228.00. VAT 1064.00. Total 8892.00.
      const res = await api(t).post(QUOTES).send(packageBody({ adults: 1 })).expect(201);
      expect(res.body.totals).toMatchObject({ subtotal: "7600.00", total: "8892.00" });
      expect(res.body.lines).toContainEqual(expect.objectContaining({ code: "SINGLE_SUPPLEMENT", amount: "400.00" }));
    });
  });

  it("refuses children when the package does not offer a child price", async () => {
    const res = await api(t).post(QUOTES).send(packageBody({ children: 1 })).expect(422);
    expect(res.body.code).toBe("PARTY_NOT_ALLOWED");
  });

  it("refuses rooms on a package that is not priced per room", async () => {
    expectProblem(await api(t).post(QUOTES).send(packageBody({ rooms: 1 })), 422, "VALIDATION_FAILED");
  });

  it("prices PER_ROOM: rooms at base occupancy plus extra people above two per room", async () => {
    await withPackageTerms({ pricingBasis: "PER_ROOM", extraPersonPrice: "500.00" }, async () => {
      // 2 rooms x 7200 = 14400. Five people is one extra above the four at base occupancy: + 500 = 14900.
      // Fee 447.00. VAT 2086.00. Total 17433.00.
      const res = await api(t).post(QUOTES).send(packageBody({ adults: 5, rooms: 2 })).expect(201);
      expect(res.body.totals).toMatchObject({ subtotal: "14900.00", fee: "447.00", tax: "2086.00", total: "17433.00" });
    });
  });

  it("refuses PER_ROOM extra people when no extra price is set, and requires rooms", async () => {
    await withPackageTerms({ pricingBasis: "PER_ROOM", extraPersonPrice: null }, async () => {
      expectProblem(await api(t).post(QUOTES).send(packageBody({ adults: 5, rooms: 2 })), 422, "PARTY_NOT_ALLOWED");
      expectProblem(await api(t).post(QUOTES).send(packageBody({ adults: 2 })), 422, "VALIDATION_FAILED");
    });
  });

  it("prices PER_PACKAGE: a flat price for the group, with an extra price beyond the group size", async () => {
    await withPackageTerms({ pricingBasis: "PER_PACKAGE", extraPersonPrice: "500.00" }, async () => {
      // Flat 7200 for up to 10 travellers. Twelve travellers: two beyond, 2 x 500 = 1000. Subtotal 8200.
      // Fee 246.00. VAT 1148.00. Total 9594.00.
      const res = await api(t).post(QUOTES).send(packageBody({ adults: 10, children: 2 })).expect(201);
      expect(res.body.totals).toMatchObject({ subtotal: "8200.00", fee: "246.00", tax: "1148.00", total: "9594.00" });
    });
  });

  it("does not quote a departure that has passed, or one with no seats left", async () => {
    expectProblem(await api(t).post(QUOTES).send(packageBody({}, ids.pastDeparture.id)), 404, "NOT_FOUND");
    const departure = ids.cairoWeekendDeparture;
    await t.prisma.packageDeparture.update({ where: { id: departure.id }, data: { bookedTravellers: departure.capacity - 1 } });
    try {
      const res = await api(t).post(QUOTES).send(packageBody({ adults: 2 })).expect(409);
      expect(res.body.code).toBe("NOT_AVAILABLE");
    } finally {
      await t.prisma.packageDeparture.update({ where: { id: departure.id }, data: { bookedTravellers: departure.bookedTravellers } });
    }
  });

  it("refuses groups outside the package's traveller limits", async () => {
    // The seed sets 10 as the maximum. Eleven adults is over the schema maximum for one request.
    expectProblem(await api(t).post(QUOTES).send(packageBody({ adults: 11 })), 422, "VALIDATION_FAILED");
    expectProblem(await api(t).post(QUOTES).send(packageBody({ adults: 0 })), 422, "VALIDATION_FAILED");
  });
});

