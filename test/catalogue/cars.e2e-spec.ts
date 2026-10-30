import { createTestApp, TestApp } from "../support/app";
import { api, expectProblem, isoDay, itemsAs, keysOf, loadCatalogue, PREFIX, PUBLIC_IMAGE_KEYS } from "./support";

const names = (items: unknown) => itemsAs<{ name: string }>(items).map((c) => c.name);

describe("Cars API (integration)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await loadCatalogue(t.prisma);
  });

  afterAll(async () => {
    await t.close();
  });

  it("lists published models only, cheapest first by default", async () => {
    const res = await api(t).get(`${PREFIX}/cars`).expect(200);
    expect(res.body.meta.total).toBe(7);
    expect(names(res.body.items)).toEqual(["Accent", "Corolla", "Elantra", "One", "RAV4", "Land Cruiser Prado", "C-Class"]);
    expect(res.body.items.map((c: { name: string }) => c.name)).not.toContain("Hidden draft model");
  });

  it("sorts by price in both directions", async () => {
    const desc = await api(t).get(`${PREFIX}/cars?sort=price-desc`).expect(200);
    expect(names(desc.body.items)[0]).toBe("C-Class");
    const asc = await api(t).get(`${PREFIX}/cars?sort=price-asc`).expect(200);
    expect(names(asc.body.items)[0]).toBe("Accent");
  });

  it("filters by category, with comma-separated codes", async () => {
    const suv = await api(t).get(`${PREFIX}/cars?categories=SUV`).expect(200);
    expect(names(suv.body.items).sort()).toEqual(["One", "RAV4"]);
    const economy = await api(t).get(`${PREFIX}/cars?categories=ECONOMY,COMPACT`).expect(200);
    expect(names(economy.body.items).sort()).toEqual(["Accent", "Corolla", "Elantra"]);
  });

  it("filters by transmission, with ANY meaning no restriction", async () => {
    const manual = await api(t).get(`${PREFIX}/cars?transmission=MANUAL`).expect(200);
    expect(names(manual.body.items)).toEqual(["Accent"]);
    const any = await api(t).get(`${PREFIX}/cars?transmission=ANY`).expect(200);
    expect(any.body.meta.total).toBe(7);
  });

  it("filters by seats, bags, brand and price", async () => {
    const seven = await api(t).get(`${PREFIX}/cars?minPassengers=7`).expect(200);
    expect(names(seven.body.items)).toEqual(["Land Cruiser Prado"]);
    const bags = await api(t).get(`${PREFIX}/cars?minBags=4`).expect(200);
    expect(names(bags.body.items)).toEqual(["Land Cruiser Prado"]);
    const toyota = await api(t).get(`${PREFIX}/cars?brands=Toyota`).expect(200);
    expect(names(toyota.body.items).sort()).toEqual(["Corolla", "Land Cruiser Prado", "RAV4"]);
    const mercedes = await api(t).get(`${PREFIX}/cars?brands=Mercedes-Benz`).expect(200);
    expect(names(mercedes.body.items)).toEqual(["C-Class"]);
    const cheap = await api(t).get(`${PREFIX}/cars?maxPrice=700`).expect(200);
    expect(names(cheap.body.items).sort()).toEqual(["Accent", "Corolla"]);
  });

  it("applies the minimum driver age per model", async () => {
    // Most models accept drivers from 21. The C-Class requires 25.
    const at21 = await api(t).get(`${PREFIX}/cars?driverAge=21`).expect(200);
    expect(at21.body.meta.total).toBe(6);
    expect(names(at21.body.items)).not.toContain("C-Class");
    const at25 = await api(t).get(`${PREFIX}/cars?driverAge=25`).expect(200);
    expect(at25.body.meta.total).toBe(7);
    expectProblem(await api(t).get(`${PREFIX}/cars?driverAge=17`), 422, "VALIDATION_FAILED");
  });

  it("combines filters with paging", async () => {
    const res = await api(t).get(`${PREFIX}/cars?categories=SUV&sort=price-desc&page=1&pageSize=1`).expect(200);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 1, total: 2, totalPages: 2 });
    expect(names(res.body.items)).toEqual(["RAV4"]);
  });

  it("returns an empty page when no model matches", async () => {
    const res = await api(t).get(`${PREFIX}/cars?minPassengers=12`).expect(200);
    expect(res.body).toEqual({ items: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
  });

  it("echoes a valid rental window on every item", async () => {
    const res = await api(t)
      .get(`${PREFIX}/cars?pickupDate=${isoDay(10)}&dropoffDate=${isoDay(13)}&pageSize=1`)
      .expect(200);
    expect(res.body.items[0].rental).toEqual({ pickupDate: isoDay(10), dropoffDate: isoDay(13), days: 3 });
  });

  it("rejects an incomplete or invalid rental window with 422", async () => {
    const cases = [
      `pickupDate=${isoDay(10)}`,
      `dropoffDate=${isoDay(10)}`,
      `pickupDate=${isoDay(13)}&dropoffDate=${isoDay(10)}`,
      `pickupDate=${isoDay(10)}&dropoffDate=${isoDay(10)}`,
      `pickupDate=${isoDay(10)}&dropoffDate=${isoDay(72)}`,
      `pickupDate=2026-02-30&dropoffDate=2026-03-02`,
      `pickupDate=${isoDay(-1)}&dropoffDate=${isoDay(2)}`,
    ];
    for (const query of cases) {
      expectProblem(await api(t).get(`${PREFIX}/cars?${query}`), 422, "VALIDATION_FAILED");
    }
  });

  it("rejects malformed filters with 422", async () => {
    const cases = ["categories=NOPE", "transmission=CVT", "minPassengers=13", "minBags=-1", "maxPrice=abc", "sort=fastest", "bogus=1"];
    for (const query of cases) {
      expectProblem(await api(t).get(`${PREFIX}/cars?${query}`), 422, "VALIDATION_FAILED");
    }
  });

  it("returns the model detail with coverage, deposit and cancellation policy", async () => {
    const res = await api(t).get(`${PREFIX}/cars/toyota-corolla`).expect(200);
    expect(res.body).toMatchObject({
      slug: "toyota-corolla",
      brand: "Toyota",
      name: "Corolla",
      category: "ECONOMY",
      transmission: "AUTOMATIC",
      minDriverAge: 21,
      pricePerDay: { amount: "650.00", currency: "EGP" },
      deposit: { amount: "3000.00", currency: "EGP" },
      includedKmPerDay: 250,
      fuelPolicy: "Full to full. Refuel before returning to avoid charges.",
      pickupNotes: expect.stringContaining("Cairo International Airport"),
      cancellationPolicy: expect.objectContaining({ code: "car-default" }),
    });
    expect(res.body.coverage).toHaveLength(3);
    expect(res.body.rentalConditions).toHaveLength(3);
    expect(res.body.images).toHaveLength(3);
    expect(keysOf(res.body.images[0])).toEqual([...PUBLIC_IMAGE_KEYS].sort());
  });

  it("shows the luxury minimum age on the C-Class", async () => {
    const res = await api(t).get(`${PREFIX}/cars/mercedes-c-class`).expect(200);
    expect(res.body.minDriverAge).toBe(25);
    expect(res.body.rentalConditions).toContain("Driver must be 25 or older for luxury category");
  });

  it("returns 404 for drafts and unknown models, and 422 for malformed slugs", async () => {
    expectProblem(await api(t).get(`${PREFIX}/cars/hidden-draft-car`), 404, "NOT_FOUND");
    expectProblem(await api(t).get(`${PREFIX}/cars/no-such-car`), 404, "NOT_FOUND");
    expectProblem(await api(t).get(`${PREFIX}/cars/Corolla`), 422, "VALIDATION_FAILED");
  });
});
