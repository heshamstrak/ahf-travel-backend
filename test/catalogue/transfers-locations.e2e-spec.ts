import { createTestApp, TestApp } from "../support/app";
import { api, expectProblem, isoDay, loadCatalogue, PREFIX } from "./support";

interface LocationItem {
  id: string;
  code: string | null;
  name: string;
  type: string;
  destination: { slug: string };
}

describe("Locations and transfers API (integration)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await loadCatalogue(t.prisma);
  });

  afterAll(async () => {
    await t.close();
  });

  async function locationId(destination: string, type: string, match: (l: LocationItem) => boolean): Promise<string> {
    const res = await api(t).get(`${PREFIX}/locations?type=${type}&destination=${destination}&pageSize=50`).expect(200);
    const found = (res.body.items as LocationItem[]).find(match);
    if (!found) throw new Error(`no ${type} in ${destination}`);
    return found.id;
  }

  describe("locations", () => {
    it("lists published locations with paging meta and no archived rows", async () => {
      const res = await api(t).get(`${PREFIX}/locations?pageSize=50`).expect(200);
      // 5 airports, 5 zones and 2 car branches. The archived branch is excluded.
      expect(res.body.meta.total).toBe(12);
      expect(res.body.items.map((l: LocationItem) => l.name)).not.toContain("Archived Luxor branch");
    });

    it("filters by type", async () => {
      const airports = await api(t).get(`${PREFIX}/locations?type=AIRPORT&pageSize=50`).expect(200);
      expect((airports.body.items as LocationItem[]).map((l) => l.code).sort()).toEqual(["ASW", "CAI", "HRG", "LXR", "SSH"]);
      const zones = await api(t).get(`${PREFIX}/locations?type=ZONE&pageSize=50`).expect(200);
      expect(zones.body.meta.total).toBe(5);
      const branches = await api(t).get(`${PREFIX}/locations?type=CAR_BRANCH&pageSize=50`).expect(200);
      expect(branches.body.meta.total).toBe(2);
    });

    it("filters by destination slug", async () => {
      const cairo = await api(t).get(`${PREFIX}/locations?destination=cairo&pageSize=50`).expect(200);
      expect((cairo.body.items as LocationItem[]).map((l) => l.name).sort()).toEqual([
        "Cairo International Airport", "Cairo city car branch", "Cairo city centre",
      ]);
      const draft = await api(t).get(`${PREFIX}/locations?destination=hidden-siwa`).expect(200);
      expect(draft.body.items).toEqual([]);
    });

    it("exposes coordinates for airports only, as text", async () => {
      const res = await api(t).get(`${PREFIX}/locations?type=AIRPORT&destination=cairo`).expect(200);
      expect(res.body.items[0]).toMatchObject({
        code: "CAI",
        // Stored as Decimal(9,6); the API returns the value without trailing zeros.
        latitude: "30.1219",
        longitude: "31.4056",
        destination: { slug: "cairo", name: "Cairo" },
      });
      const zone = await api(t).get(`${PREFIX}/locations?type=ZONE&destination=cairo`).expect(200);
      expect(zone.body.items[0]).toMatchObject({ latitude: null, longitude: null });
    });

    it("rejects an unknown type or a non-slug destination with 422", async () => {
      expectProblem(await api(t).get(`${PREFIX}/locations?type=PORT`), 422, "VALIDATION_FAILED");
      expectProblem(await api(t).get(`${PREFIX}/locations?destination=Cairo`), 422, "VALIDATION_FAILED");
      expectProblem(await api(t).get(`${PREFIX}/locations?page=0`), 422, "VALIDATION_FAILED");
    });
  });

  describe("transfer vehicle classes", () => {
    it("returns the active classes ordered by capacity, not paginated", async () => {
      const res = await api(t).get(`${PREFIX}/transfers/vehicle-classes`).expect(200);
      // Capacity first, then the enum's declaration order (Postgres sorts enums by declaration, not by name).
      expect(res.body.items.map((c: { code: string }) => c.code)).toEqual(["SEDAN", "PREMIUM", "SUV", "VAN", "MINIBUS"]);
      expect(res.body.items[4]).toMatchObject({
        code: "MINIBUS",
        name: "Group Minibus",
        passengersMax: 12,
        luggageMax: 10,
      });
      expect(res.body.items[0].image.isCover).toBe(true);
    });
  });

  describe("transfer rates", () => {
    it("prices a route for every vehicle class, cheapest first, excluding expired rates", async () => {
      const origin = await locationId("cairo", "AIRPORT", (l) => l.code === "CAI");
      const destination = await locationId("cairo", "ZONE", (l) => l.name === "Cairo city centre");
      const res = await api(t)
        .get(`${PREFIX}/transfers/rates?originLocationId=${origin}&destinationLocationId=${destination}`)
        .expect(200);
      expect(res.body.meta.total).toBe(5);
      expect(res.body.items.map((r: { amount: { amount: string } }) => r.amount.amount)).toEqual([
        "850.00", "1200.00", "1500.00", "2200.00", "2400.00",
      ]);
      expect(res.body.items[0]).toMatchObject({
        amount: { currency: "EGP" },
        origin: { code: "CAI", type: "AIRPORT" },
        destination: { name: "Cairo city centre", type: "ZONE" },
        vehicleClass: { code: "SEDAN", passengersMax: 3, luggageMax: 2 },
        validDate: isoDay(0),
        priceBasis: "DEV_PLACEHOLDER",
        echo: { time: null, passengers: 1, luggage: 0 },
      });
    });

    it("keeps only vehicle classes that fit the passengers and luggage", async () => {
      const origin = await locationId("cairo", "AIRPORT", (l) => l.code === "CAI");
      const destination = await locationId("cairo", "ZONE", (l) => l.name === "Cairo city centre");
      const base = `originLocationId=${origin}&destinationLocationId=${destination}`;
      const four = await api(t).get(`${PREFIX}/transfers/rates?${base}&passengers=4`).expect(200);
      expect(four.body.items.map((r: { vehicleClass: { code: string } }) => r.vehicleClass.code)).toEqual(["SUV", "VAN", "MINIBUS"]);
      const eight = await api(t).get(`${PREFIX}/transfers/rates?${base}&passengers=8`).expect(200);
      expect(eight.body.items.map((r: { vehicleClass: { code: string } }) => r.vehicleClass.code)).toEqual(["MINIBUS"]);
      const luggage = await api(t).get(`${PREFIX}/transfers/rates?${base}&luggage=7`).expect(200);
      expect(luggage.body.items.map((r: { vehicleClass: { code: string } }) => r.vehicleClass.code)).toEqual(["MINIBUS"]);
      const none = await api(t).get(`${PREFIX}/transfers/rates?${base}&passengers=12&luggage=10&date=${isoDay(60)}`).expect(200);
      expect(none.body.items).toHaveLength(1);
      expectProblem(await api(t).get(`${PREFIX}/transfers/rates?${base}&date=${isoDay(-1)}`), 422, "VALIDATION_FAILED");
    });

    it("applies the validity window to the requested date", async () => {
      const origin = await locationId("cairo", "AIRPORT", (l) => l.code === "CAI");
      const destination = await locationId("cairo", "ZONE", (l) => l.name === "Cairo city centre");
      const base = `originLocationId=${origin}&destinationLocationId=${destination}`;
      // The expired 2024 SEDAN rate (500 EGP) is never offered: it ended before any allowed date.
      const today = await api(t).get(`${PREFIX}/transfers/rates?${base}&date=${isoDay(0)}`).expect(200);
      expect(today.body.items.map((r: { amount: { amount: string } }) => r.amount.amount)).not.toContain("500.00");
      // Dates before the business today are refused, so no past rate can be searched.
      expectProblem(await api(t).get(`${PREFIX}/transfers/rates?${base}&date=2024-06-01`), 422, "VALIDATION_FAILED");
    });

    it("hides inactive rates and returns only the active row for a route", async () => {
      // The Hurghada VAN has an inactive 1300 EGP rate from 2026-02-01 and an active 1500 EGP rate.
      const origin = await locationId("hurghada", "AIRPORT", (l) => l.code === "HRG");
      const destination = await locationId("hurghada", "ZONE", (l) => l.name === "Hurghada resort area");
      const res = await api(t)
        .get(`${PREFIX}/transfers/rates?originLocationId=${origin}&destinationLocationId=${destination}&passengers=7&luggage=6`)
        .expect(200);
      expect(res.body.items.map((r: { amount: { amount: string } }) => r.amount.amount)).toEqual(["1500.00", "2400.00"]);
    });

    it("returns nothing from an archived location", async () => {
      const archived = await t.prisma.location.findFirstOrThrow({ where: { name: "Archived Luxor branch" } });
      const zone = await locationId("luxor", "ZONE", (l) => l.name === "Luxor city centre");
      const res = await api(t)
        .get(`${PREFIX}/transfers/rates?originLocationId=${archived.id}&destinationLocationId=${zone}`)
        .expect(200);
      expect(res.body.items).toEqual([]);
    });

    it("echoes the requested time and counts", async () => {
      const origin = await locationId("cairo", "AIRPORT", (l) => l.code === "CAI");
      const destination = await locationId("cairo", "ZONE", (l) => l.name === "Cairo city centre");
      const res = await api(t)
        .get(`${PREFIX}/transfers/rates?originLocationId=${origin}&destinationLocationId=${destination}&time=14:30&passengers=2&luggage=1&pageSize=1`)
        .expect(200);
      expect(res.body.items[0].echo).toEqual({ time: "14:30", passengers: 2, luggage: 1 });
      expect(res.body.meta.totalPages).toBe(5);
    });

    it("rejects same-place routes, bad ids and bad parameters with 422", async () => {
      const origin = await locationId("cairo", "AIRPORT", (l) => l.code === "CAI");
      expectProblem(
        await api(t).get(`${PREFIX}/transfers/rates?originLocationId=${origin}&destinationLocationId=${origin}`),
        422,
        "VALIDATION_FAILED",
      );
      expectProblem(
        await api(t).get(`${PREFIX}/transfers/rates?originLocationId=CAI&destinationLocationId=${origin}`),
        422,
        "VALIDATION_FAILED",
      );
      expectProblem(await api(t).get(`${PREFIX}/transfers/rates?originLocationId=${origin}`), 422, "VALIDATION_FAILED");
      const cases = ["date=2026-02-30", "time=25:00", "passengers=13", "luggage=-1"];
      for (const query of cases) {
        expectProblem(
          await api(t).get(`${PREFIX}/transfers/rates?originLocationId=${origin}&destinationLocationId=${origin}&${query}`),
          422,
          "VALIDATION_FAILED",
        );
      }
    });

    it("returns an empty page for an unknown but well-formed location", async () => {
      const res = await api(t)
        .get(`${PREFIX}/transfers/rates?originLocationId=00000000-0000-4000-8000-000000000000&destinationLocationId=00000000-0000-4000-8000-000000000001`)
        .expect(200);
      expect(res.body).toEqual({ items: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    });
  });
});
