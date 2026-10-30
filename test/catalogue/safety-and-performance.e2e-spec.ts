import { CARS, DESTINATIONS, HOTELS, PACKAGES, ROUTES, TOURS, VEHICLE_CLASSES } from "../../prisma/seed/data";
import { createTestApp, TestApp } from "../support/app";
import {
  allKeys,
  api,
  expectProblem,
  INTERNAL_KEYS,
  isoDay,
  loadCatalogue,
  nextTourSessionDay,
  PREFIX,
  PUBLIC_IMAGE_KEYS,
} from "./support";

/** Every public catalogue response a visitor can reach, with real identifiers from the seed. */
async function publicResponses(t: TestApp): Promise<{ path: string; body: unknown }[]> {
  const paths = [
    "/destinations?pageSize=50",
    "/destinations/cairo",
    "/hotels?pageSize=50",
    "/hotels?sort=price-asc&stars=5&amenities=Pool&pageSize=50",
    "/hotels/marriott-mena-house",
    "/hotels/marriott-mena-house/rooms",
    "/tours?pageSize=50",
    "/tours/pyramids-sphinx-tour",
    `/tours/nile-dinner-cruise/sessions?from=${await nextTourSessionDay(t.prisma, "nile-dinner-cruise")}&to=${await nextTourSessionDay(t.prisma, "nile-dinner-cruise")}`,
    "/cars?pageSize=50",
    "/cars/toyota-corolla",
    "/transfers/vehicle-classes",
    "/locations?pageSize=50",
    "/packages?pageSize=50",
    "/packages/cairo-weekend",
    "/packages/cairo-weekend/departures?from=" + isoDay(0) + "&to=" + isoDay(364),
  ];
  const out: { path: string; body: unknown }[] = [];
  for (const path of paths) {
    const res = await api(t).get(`${PREFIX}${path}`).expect(200);
    out.push({ path, body: res.body });
  }
  return out;
}

/** Walks every page of a list and returns the ids in the order they came back. */
async function allIds(t: TestApp, path: string, pageSize: number): Promise<string[]> {
  const ids: string[] = [];
  const base = path.replace(/[?&]pageSize=\d+/, "");
  const sep = base.includes("?") ? "&" : "?";
  let page = 1;
  for (;;) {
    const res = await api(t).get(`${PREFIX}${base}${sep}page=${page}&pageSize=${pageSize}`).expect(200);
    ids.push(...(res.body.items as { id: string }[]).map((item) => item.id));
    if (page >= (res.body.meta.totalPages as number)) break;
    page++;
  }
  return ids;
}

describe("Catalogue safety, ordering and query behaviour (integration)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ PRISMA_QUERY_EVENTS: "true" });
    await loadCatalogue(t.prisma);
  });

  afterAll(async () => {
    await t.close();
    delete process.env.PRISMA_QUERY_EVENTS;
  });

  describe("public responses expose no internal fields", () => {
    it("omits storage, audit, status, inventory and foreign-key fields from every public endpoint", async () => {
      const responses = await publicResponses(t);
      for (const { path, body } of responses) {
        const keys = allKeys(body);
        const leaked = INTERNAL_KEYS.filter((key) => keys.has(key));
        expect({ path, leaked }).toEqual({ path, leaked: [] });
      }
    });

    it("limits every image to the public image fields", async () => {
      const responses = await publicResponses(t);
      const images: Record<string, unknown>[] = [];
      const collect = (value: unknown) => {
        if (Array.isArray(value)) value.forEach(collect);
        else if (value !== null && typeof value === "object") {
          const obj = value as Record<string, unknown>;
          if ("altText" in obj && "url" in obj) images.push(obj);
          Object.values(obj).forEach(collect);
        }
      };
      responses.forEach((r) => collect(r.body));
      expect(images.length).toBeGreaterThan(20);
      for (const image of images) {
        expect(Object.keys(image).every((key) => PUBLIC_IMAGE_KEYS.includes(key))).toBe(true);
        expect(String(image.url)).toMatch(/^https:\/\//);
      }
    });

    it("answers JSON for success and problem+json for errors", async () => {
      const ok = await api(t).get(`${PREFIX}/destinations`).expect(200);
      expect(ok.headers["content-type"]).toMatch(/application\/json/);
      expectProblem(await api(t).get(`${PREFIX}/hotels?page=0`), 422, "VALIDATION_FAILED");
    });

    it("returns a problem document for unknown routes", async () => {
      const res = await api(t).get(`${PREFIX}/no-such-route`);
      expect(res.status).toBe(404);
      expect(res.headers["content-type"]).toMatch(/application\/problem\+json/);
    });
  });

  describe("deterministic ordering and paging", () => {
    it.each<[string, number]>([
      ["/hotels?sort=price-asc", 2],
      ["/hotels?sort=recommended", 2],
      ["/tours?pageSize=50", 2],
      ["/cars?sort=price-desc", 2],
      ["/packages?sort=price-asc", 3],
      ["/destinations", 4],
    ])("pages %s without duplicates or gaps", async (path, pageSize) => {
      const first = await allIds(t, path, pageSize);
      const second = await allIds(t, path, pageSize);
      expect(second).toEqual(first);
      expect(new Set(first).size).toBe(first.length);
      const whole = await allIds(t, path, 50);
      expect([...first].sort()).toEqual([...whole].sort());
    });
  });

  describe("query counts do not grow with page size (no N+1)", () => {
    async function countQueries(fn: () => Promise<unknown>): Promise<number> {
      let count = 0;
      const off = t.prisma.onQuery(() => {
        count++;
      });
      try {
        await fn();
      } finally {
        off();
      }
      return count;
    }

    it.each<[string, string]>([
      ["hotels", "/hotels?sort=price-asc&pageSize=%s"],
      ["tours", "/tours?pageSize=%s"],
      ["cars", "/cars?pageSize=%s"],
      ["packages", "/packages?pageSize=%s"],
      ["destinations", "/destinations?pageSize=%s"],
      ["locations", "/locations?pageSize=%s"],
    ])("%s list uses the same statements for one row and for many", async (_name, template) => {
      const small = await countQueries(() => api(t).get(`${PREFIX}${template.replace("%s", "1")}`).expect(200));
      const large = await countQueries(() => api(t).get(`${PREFIX}${template.replace("%s", "50")}`).expect(200));
      expect(large).toBe(small);
      // Fixed cost per request: the page query, the count, the covers and any grouped counts.
      expect(large).toBeLessThanOrEqual(12);
    });

    it("loads room rates and galleries for a hotel in a fixed number of statements", async () => {
      const two = await countQueries(() => api(t).get(`${PREFIX}/hotels/marriott-mena-house/rooms`).expect(200));
      const one = await countQueries(() => api(t).get(`${PREFIX}/hotels/sheraton-hurghada/rooms`).expect(200));
      expect(two).toBe(one);
    });

    it("counts destination products in grouped queries regardless of how many destinations are listed", async () => {
      const few = await countQueries(() => api(t).get(`${PREFIX}/destinations?pageSize=1`).expect(200));
      const many = await countQueries(() => api(t).get(`${PREFIX}/destinations?pageSize=50`).expect(200));
      expect(many).toBe(few);
    });
  });

  describe("seed", () => {
    it("is idempotent: loading the catalogue twice leaves the same rows", async () => {
      const count = async () => ({
        destinations: await t.prisma.destination.count(),
        locations: await t.prisma.location.count(),
        hotels: await t.prisma.hotel.count(),
        rooms: await t.prisma.room.count(),
        ratePlans: await t.prisma.ratePlan.count(),
        tours: await t.prisma.tour.count(),
        tourSessions: await t.prisma.tourSession.count(),
        carModels: await t.prisma.carModel.count(),
        carInventory: await t.prisma.carInventory.count(),
        transferRates: await t.prisma.transferRate.count(),
        packages: await t.prisma.package.count(),
        packageDepartures: await t.prisma.packageDeparture.count(),
        media: await t.prisma.media.count(),
        policies: await t.prisma.cancellationPolicy.count(),
        pricingRules: await t.prisma.pricingRule.count(),
        settings: await t.prisma.setting.count(),
      });
      const before = await count();
      await loadCatalogue(t.prisma);
      const after = await count();
      expect(after).toEqual(before);
    });

    it("matches the database to the seed definitions", async () => {
      // Derived from the seed, not hard-coded: other suites may leave their own rows in the test database.
      expect(await t.prisma.destination.count({ where: { slug: { in: DESTINATIONS.map((d) => d.slug) } } })).toBe(DESTINATIONS.length);
      expect(await t.prisma.hotel.count({ where: { slug: { in: HOTELS.map((h) => h.slug) } } })).toBe(HOTELS.length);
      expect(await t.prisma.tour.count({ where: { slug: { in: TOURS.map((x) => x.slug) } } })).toBe(TOURS.length);
      expect(await t.prisma.carModel.count({ where: { slug: { in: CARS.map((c) => c.slug) } } })).toBe(CARS.length);
      expect(await t.prisma.package.count({ where: { slug: { in: PACKAGES.map((p) => p.slug) } } })).toBe(PACKAGES.length);
      // Routes in both directions for every vehicle class, plus one expired and one inactive fixture.
      expect(await t.prisma.transferRate.count()).toBe(ROUTES.length * VEHICLE_CLASSES.length * 2 + 2);
    });
  });
});
