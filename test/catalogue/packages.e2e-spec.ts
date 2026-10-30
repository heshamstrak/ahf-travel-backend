import { createTestApp, TestApp } from "../support/app";
import { api, expectProblem, isoDay, itemsAs, keysOf, loadCatalogue, nextDepartureDay, PREFIX, PUBLIC_IMAGE_KEYS } from "./support";

const slugs = (items: unknown) => itemsAs<{ slug: string }>(items).map((p) => p.slug);

describe("Packages API (integration)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await loadCatalogue(t.prisma);
  });

  afterAll(async () => {
    await t.close();
  });

  describe("list", () => {
    it("lists published packages only, by title by default", async () => {
      const res = await api(t).get(`${PREFIX}/packages?pageSize=50`).expect(200);
      expect(res.body.meta.total).toBe(4);
      expect(res.body.items.map((p: { title: string }) => p.title)).toEqual([
        "Cairo Weekend", "Classic Egypt", "Egypt Highlights", "Red Sea Escape",
      ]);
    });

    it("hides draft and soft-deleted packages", async () => {
      const res = await api(t).get(`${PREFIX}/packages?pageSize=50`).expect(200);
      expect(slugs(res.body.items)).not.toContain("hidden-draft-package");
      expect(slugs(res.body.items)).not.toContain("hidden-deleted-package");
    });

    it("sorts by starting price", async () => {
      const asc = await api(t).get(`${PREFIX}/packages?sort=price-asc`).expect(200);
      expect(slugs(asc.body.items)).toEqual(["cairo-weekend", "red-sea-escape", "classic-egypt", "egypt-highlights"]);
      const desc = await api(t).get(`${PREFIX}/packages?sort=price-desc`).expect(200);
      expect(slugs(desc.body.items)).toEqual(["egypt-highlights", "classic-egypt", "red-sea-escape", "cairo-weekend"]);
    });

    it("filters by budget tier", async () => {
      const luxury = await api(t).get(`${PREFIX}/packages?budget=luxury`).expect(200);
      expect(slugs(luxury.body.items).sort()).toEqual(["classic-egypt", "egypt-highlights"]);
      const mid = await api(t).get(`${PREFIX}/packages?budget=mid`).expect(200);
      expect(slugs(mid.body.items).sort()).toEqual(["cairo-weekend", "red-sea-escape"]);
      // The draft and deleted fixtures are budget tier BUDGET, and they stay hidden.
      const budget = await api(t).get(`${PREFIX}/packages?budget=budget`).expect(200);
      expect(budget.body.items).toEqual([]);
    });

    it("filters by duration band in nights", async () => {
      const short = await api(t).get(`${PREFIX}/packages?duration=short`).expect(200);
      expect(slugs(short.body.items)).toEqual(["cairo-weekend"]);
      const medium = await api(t).get(`${PREFIX}/packages?duration=medium`).expect(200);
      expect(slugs(medium.body.items).sort()).toEqual(["classic-egypt", "red-sea-escape"]);
      const long = await api(t).get(`${PREFIX}/packages?duration=long`).expect(200);
      expect(slugs(long.body.items)).toEqual(["egypt-highlights"]);
    });

    it("filters by destination slug, including multi-destination packages", async () => {
      const luxor = await api(t).get(`${PREFIX}/packages?destination=luxor`).expect(200);
      expect(slugs(luxor.body.items).sort()).toEqual(["classic-egypt", "egypt-highlights"]);
      const giza = await api(t).get(`${PREFIX}/packages?destination=giza`).expect(200);
      expect(slugs(giza.body.items)).toEqual(["cairo-weekend"]);
      const hurghada = await api(t).get(`${PREFIX}/packages?destination=hurghada`).expect(200);
      expect(slugs(hurghada.body.items).sort()).toEqual(["egypt-highlights", "red-sea-escape"]);
    });

    it("keeps packages whose traveller limits include the group size", async () => {
      const ten = await api(t).get(`${PREFIX}/packages?travellers=10`).expect(200);
      expect(ten.body.meta.total).toBe(4);
      expectProblem(await api(t).get(`${PREFIX}/packages?travellers=11`), 422, "VALIDATION_FAILED");
    });

    it("keeps only packages with an open departure on or after a date", async () => {
      const day = await nextDepartureDay(t.prisma, "cairo-weekend");
      const onDay = await api(t).get(`${PREFIX}/packages?date=${day}`).expect(200);
      expect(slugs(onDay.body.items)).toContain("cairo-weekend");
      const far = await api(t).get(`${PREFIX}/packages?date=2099-01-01`).expect(200);
      expect(far.body.items).toEqual([]);
    });

    it("rejects a past date instead of treating it as today", async () => {
      expectProblem(await api(t).get(`${PREFIX}/packages?date=${isoDay(-1)}`), 422, "VALIDATION_FAILED");
    });

    it("reports the next open departure and the included components per package", async () => {
      const res = await api(t).get(`${PREFIX}/packages?destination=giza`).expect(200);
      const pkg = res.body.items[0];
      expect(pkg).toMatchObject({
        slug: "cairo-weekend",
        durationDays: 3,
        durationNights: 2,
        budgetTier: "MID",
        pricingBasis: "PER_PERSON",
        startingPrice: { amount: "7200.00", currency: "EGP" },
        includes: { hotel: true, tours: true, transfers: true },
        nextDeparture: await nextDepartureDay(t.prisma, "cairo-weekend"),
      });
      expect(pkg.destinations.map((d: { slug: string }) => d.slug)).toEqual(["cairo", "giza"]);
      expect(keysOf(pkg.image)).toEqual([...PUBLIC_IMAGE_KEYS].sort());
    });

    it("pages with stable boundaries and an empty page past the end", async () => {
      const page = await api(t).get(`${PREFIX}/packages?pageSize=3&page=2`).expect(200);
      expect(page.body.items).toHaveLength(1);
      expect(page.body.meta).toEqual({ page: 2, pageSize: 3, total: 4, totalPages: 2 });
      const beyond = await api(t).get(`${PREFIX}/packages?pageSize=3&page=5`).expect(200);
      expect(beyond.body.items).toEqual([]);
    });

    it("rejects invalid filters with 422", async () => {
      const cases = [
        "duration=weekly", "budget=ultra", "sort=cheapest", "destination=Luxor",
        "date=2026-02-30", "travellers=0", "bogus=1",
      ];
      for (const query of cases) {
        expectProblem(await api(t).get(`${PREFIX}/packages?${query}`), 422, "VALIDATION_FAILED");
      }
    });
  });

  describe("detail", () => {
    it("returns the itinerary, components, pricing and cancellation policy", async () => {
      const res = await api(t).get(`${PREFIX}/packages/cairo-weekend`).expect(200);
      expect(res.body).toMatchObject({
        slug: "cairo-weekend",
        title: "Cairo Weekend",
        startingPrice: { amount: "7200.00", currency: "EGP" },
        pricing: {
          basis: "PER_PERSON",
          basePrice: { amount: "7200.00", currency: "EGP" },
          singleSupplement: null,
          childPrice: null,
          extraPersonPrice: null,
          minTravellers: 1,
          maxTravellers: 10,
        },
        components: {
          hotel: { name: "Marriott Mena House", stars: 5, description: expect.any(String) },
          tours: ["Pyramids & Sphinx Tour", "Nile Dinner Cruise with Show"],
          transfers: ["Airport pick-up", "Airport drop-off"],
        },
        cancellationPolicy: expect.objectContaining({ code: "package-default" }),
      });
      expect(res.body.itinerary.map((d: { day: number }) => d.day)).toEqual([1, 2, 3]);
      expect(res.body.images).toHaveLength(3);
    });

    it("exposes only the public component fields", async () => {
      const res = await api(t).get(`${PREFIX}/packages/classic-egypt`).expect(200);
      expect(keysOf(res.body.components)).toEqual(["hotel", "tours", "transfers"]);
      expect(keysOf(res.body.components.hotel)).toEqual(["description", "name", "stars"]);
    });

    it("returns 404 for drafts, soft-deleted packages and unknown slugs", async () => {
      expectProblem(await api(t).get(`${PREFIX}/packages/hidden-draft-package`), 404, "NOT_FOUND");
      expectProblem(await api(t).get(`${PREFIX}/packages/hidden-deleted-package`), 404, "NOT_FOUND");
      expectProblem(await api(t).get(`${PREFIX}/packages/no-such-package`), 404, "NOT_FOUND");
    });

    it("resolves by UUID and rejects a malformed identifier", async () => {
      const list = await api(t).get(`${PREFIX}/packages?destination=giza`).expect(200);
      const res = await api(t).get(`${PREFIX}/packages/${list.body.items[0].id as string}`).expect(200);
      expect(res.body.slug).toBe("cairo-weekend");
      expectProblem(await api(t).get(`${PREFIX}/packages/Cairo-Weekend`), 422, "VALIDATION_FAILED");
    });
  });

  describe("departures", () => {
    it("lists open future departures in a window with remaining travellers", async () => {
      const day = await nextDepartureDay(t.prisma, "cairo-weekend");
      const res = await api(t).get(`${PREFIX}/packages/cairo-weekend/departures?from=${day}&to=${day}`).expect(200);
      expect(res.body).toEqual([
        {
          id: expect.any(String),
          startsOn: day,
          remainingTravellers: 20,
          priceOverride: null,
        },
      ]);
    });

    it("filters by the number of travellers", async () => {
      const day = await nextDepartureDay(t.prisma, "cairo-weekend");
      const fits = await api(t).get(`${PREFIX}/packages/cairo-weekend/departures?from=${day}&to=${day}&travellers=10`).expect(200);
      expect(fits.body).toHaveLength(1);
      const none = await api(t).get(`${PREFIX}/packages/cairo-weekend/departures?from=${day}&to=${day}&travellers=21`).expect(422);
      expect(none.body.code).toBe("VALIDATION_FAILED");
    });

    it("rejects a departure window that starts in the past", async () => {
      expectProblem(
        await api(t).get(`${PREFIX}/packages/cairo-weekend/departures?from=2025-05-01&to=2025-06-30`),
        422,
        "VALIDATION_FAILED",
      );
    });

    it("returns an empty list for a window without departures", async () => {
      const res = await api(t).get(`${PREFIX}/packages/cairo-weekend/departures?from=2099-01-01&to=2099-01-31`).expect(200);
      expect(res.body).toEqual([]);
    });

    it("validates the window and returns 404 for unpublished packages", async () => {
      expectProblem(await api(t).get(`${PREFIX}/packages/cairo-weekend/departures?from=${isoDay(5)}&to=${isoDay(0)}`), 422, "VALIDATION_FAILED");
      expectProblem(await api(t).get(`${PREFIX}/packages/cairo-weekend/departures?from=${isoDay(0)}&to=${isoDay(366)}`), 422, "VALIDATION_FAILED");
      expectProblem(await api(t).get(`${PREFIX}/packages/cairo-weekend/departures?from=${isoDay(0)}`), 422, "VALIDATION_FAILED");
      expectProblem(await api(t).get(`${PREFIX}/packages/hidden-draft-package/departures?from=${isoDay(0)}&to=${isoDay(1)}`), 404, "NOT_FOUND");
    });
  });
});
