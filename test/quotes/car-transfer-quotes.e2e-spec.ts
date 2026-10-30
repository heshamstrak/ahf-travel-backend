import { createTestApp, TestApp } from "../support/app";
import { loadCatalogue } from "../catalogue/support";
import { api, catalogueIds, expectProblem, isoDay, QUOTES } from "./support";
import { randomUUID } from "crypto";

describe("Car quotes (integration)", () => {
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

  const carBody = (overrides: Record<string, unknown> = {}, carId = ids?.corollaCar.id) => ({
    productType: "CAR",
    productId: carId,
    selection: {
      pickupDate: isoDay(10),
      dropoffDate: isoDay(13),
      pickupLocationId: ids?.caiAirport.id,
      driverAge: 30,
      ...overrides,
    },
  });

  it("prices calendar days x daily rate, with fee and VAT, and no surcharge for a mature driver", async () => {
    // 3 x 650.00 = 1950.00. Fee 58.50. VAT 273.00. Total 2281.50.
    const res = await api(t).post(QUOTES).send(carBody()).expect(201);
    expect(res.body.totals).toMatchObject({ subtotal: "1950.00", surcharge: "0.00", fee: "58.50", tax: "273.00", total: "2281.50" });
    expect(res.body.selection).toMatchObject({ days: 3, driverAge: 30 });
  });

  it("adds the configured young-driver surcharge per day below the threshold", async () => {
    // 1950 + 150 x 3 days = 2400. Fee 72.00. VAT 336.00. Total 2808.00.
    const res = await api(t).post(QUOTES).send(carBody({ driverAge: 22 })).expect(201);
    expect(res.body.totals).toMatchObject({ subtotal: "1950.00", surcharge: "450.00", fee: "72.00", tax: "336.00", total: "2808.00" });
    expect(res.body.lines).toContainEqual(
      expect.objectContaining({ kind: "SURCHARGE", code: "young-driver-surcharge", quantity: 3, amount: "450.00", rule: expect.objectContaining({ code: "young-driver-surcharge" }) }),
    );
  });

  it("refuses a driver below the model's minimum age, and accepts a driver at the minimum", async () => {
    const young = await api(t).post(QUOTES).send(carBody({ driverAge: 20 })).expect(422);
    expect(young.body.code).toBe("DRIVER_TOO_YOUNG");
    // The C-Class needs drivers of 25 or older.
    const cClassYoung = await api(t).post(QUOTES).send(carBody({ driverAge: 22 }, ids.cClassCar.id)).expect(422);
    expect(cClassYoung.body.code).toBe("DRIVER_TOO_YOUNG");
    // At 25 the luxury car is priced with no surcharge: 3 x 2100 = 6300. Fee 189.00. VAT 882.00. Total 7371.00.
    const cClass = await api(t).post(QUOTES).send(carBody({ driverAge: 25 }, ids.cClassCar.id)).expect(201);
    expect(cClass.body.totals).toMatchObject({ subtotal: "6300.00", surcharge: "0.00", total: "7371.00" });
  });

  it("rejects a pick-up in the past, a drop-off on or before pick-up, and rentals over the maximum", async () => {
    expectProblem(await api(t).post(QUOTES).send(carBody({ pickupDate: isoDay(-1) })), 422, "VALIDATION_FAILED");
    expectProblem(await api(t).post(QUOTES).send(carBody({ dropoffDate: isoDay(10) })), 422, "VALIDATION_FAILED");
    expectProblem(await api(t).post(QUOTES).send(carBody({ dropoffDate: isoDay(72) })), 422, "VALIDATION_FAILED");
  });

  it("only prices pick-up at an airport or car branch that is published", async () => {
    expectProblem(await api(t).post(QUOTES).send(carBody({ pickupLocationId: ids.zoneCairo.id })), 404, "NOT_FOUND");
    expectProblem(await api(t).post(QUOTES).send(carBody({ pickupLocationId: ids.archivedBranch.id })), 404, "NOT_FOUND");
  });

  it("refuses a rental on days without a free vehicle, and never quotes a draft model", async () => {
    // Inventory covers the next 30 days, so day 70 has no vehicles.
    const res = await api(t).post(QUOTES).send(carBody({ pickupDate: isoDay(70), dropoffDate: isoDay(72) })).expect(409);
    expect(res.body.code).toBe("NOT_AVAILABLE");
    expectProblem(await api(t).post(QUOTES).send(carBody({}, ids.draftCar.id)), 404, "NOT_FOUND");
  });

  it("rejects an invalid selection field, including a client price", async () => {
    expectProblem(await api(t).post(QUOTES).send(carBody({ price: 1 })), 422, "VALIDATION_FAILED");
    expectProblem(await api(t).post(QUOTES).send(carBody({ pickupLocationId: "not-a-uuid" })), 422, "VALIDATION_FAILED");
  });
});

describe("Transfer quotes (integration)", () => {
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

  const transferBody = (overrides: Record<string, unknown> = {}, rateId = ids?.sedanRoute.id) => ({
    productType: "TRANSFER",
    productId: rateId,
    selection: { date: isoDay(5), passengers: 2, luggage: 1, ...overrides },
  });

  it("prices one vehicle on the route, marked as a development placeholder", async () => {
    // 850.00 for the vehicle. Fee 25.50. VAT 119.00. Total 994.50.
    const res = await api(t).post(QUOTES).send(transferBody()).expect(201);
    expect(res.body.totals).toMatchObject({ subtotal: "850.00", fee: "25.50", tax: "119.00", total: "994.50" });
    expect(res.body.lines[0]).toMatchObject({ kind: "BASE", code: "VEHICLE", quantity: 1, note: "DEV_PLACEHOLDER_PRICE" });
    expect(res.body.product).toMatchObject({ priceBasis: "DEV_PLACEHOLDER", vehicleClass: { code: "SEDAN" } });
  });

  it("refuses passengers or bags above the vehicle's limits", async () => {
    const tooMany = await api(t).post(QUOTES).send(transferBody({ passengers: 4 })).expect(422);
    expect(tooMany.body.code).toBe("PARTY_NOT_ALLOWED");
    const tooMuchLuggage = await api(t).post(QUOTES).send(transferBody({ luggage: 3 })).expect(422);
    expect(tooMuchLuggage.body.code).toBe("PARTY_NOT_ALLOWED");
  });

  it("does not quote an expired or inactive route", async () => {
    expectProblem(await api(t).post(QUOTES).send(transferBody({}, ids.expiredRoute.id)), 404, "NOT_FOUND");
    expectProblem(await api(t).post(QUOTES).send(transferBody({}, ids.inactiveRoute.id)), 404, "NOT_FOUND");
    expectProblem(await api(t).post(QUOTES).send(transferBody({}, randomUUID())), 404, "NOT_FOUND");
  });

  it("rejects a transfer date in the past", async () => {
    expectProblem(await api(t).post(QUOTES).send(transferBody({ date: isoDay(-1) })), 422, "VALIDATION_FAILED");
  });

  it("refuses a date with no vehicle left, and a date outside the capacity window", async () => {
    const outside = await api(t).post(QUOTES).send(transferBody({ date: isoDay(40) })).expect(409);
    expect(outside.body.code).toBe("NOT_AVAILABLE");
    const day = new Date(`${isoDay(5)}T00:00:00Z`);
    const capacity = await t.prisma.transferCapacity.findFirstOrThrow({ where: { vehicleClassId: ids.sedanRoute.vehicleClassId, date: day } });
    await t.prisma.transferCapacity.update({
      where: { vehicleClassId_date: { vehicleClassId: capacity.vehicleClassId, date: day } },
      data: { bookedUnits: capacity.totalUnits },
    });
    try {
      expectProblem(await api(t).post(QUOTES).send(transferBody()), 409, "NOT_AVAILABLE");
    } finally {
      await t.prisma.transferCapacity.update({
        where: { vehicleClassId_date: { vehicleClassId: capacity.vehicleClassId, date: day } },
        data: { bookedUnits: capacity.bookedUnits },
      });
    }
  });
});
