import { createTestApp, TestApp } from "../support/app";
import { api, expectProblem, isoDay, itemsAs, keysOf, loadCatalogue, nextTourSessionDay, PREFIX, PUBLIC_IMAGE_KEYS } from "./support";

/** Hour of an instant on the Cairo wall clock. */
const cairoHour = (at: Date): number =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", hourCycle: "h23" }).format(at));

const slugs = (items: unknown) => itemsAs<{ slug: string }>(items).map((t) => t.slug);

describe("Tours API (integration)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await loadCatalogue(t.prisma);
  });

  afterAll(async () => {
    await t.close();
  });

  describe("list", () => {
    it("lists published tours only, and never the archived one", async () => {
      const res = await api(t).get(`${PREFIX}/tours?pageSize=50`).expect(200);
      expect(res.body.meta.total).toBe(6);
      expect(slugs(res.body.items)).not.toContain("hidden-archived-tour");
    });

    it("sorts by recommendation (rating, then review count) by default", async () => {
      const res = await api(t).get(`${PREFIX}/tours?pageSize=50`).expect(200);
      expect(slugs(res.body.items)).toEqual([
        "luxor-full-day-tour",
        "pyramids-sphinx-tour",
        "aswan-felucca-philae",
        "red-sea-snorkeling-adventure",
        "giza-pyramids-sunset",
        "nile-dinner-cruise",
      ]);
    });

    it("sorts by price and by rating", async () => {
      const asc = await api(t).get(`${PREFIX}/tours?sort=price-asc&pageSize=50`).expect(200);
      expect(slugs(asc.body.items)).toEqual([
        "nile-dinner-cruise", "giza-pyramids-sunset", "red-sea-snorkeling-adventure",
        "pyramids-sphinx-tour", "aswan-felucca-philae", "luxor-full-day-tour",
      ]);
      const desc = await api(t).get(`${PREFIX}/tours?sort=price-desc&pageSize=50`).expect(200);
      expect(slugs(desc.body.items)[0]).toBe("luxor-full-day-tour");
      const rating = await api(t).get(`${PREFIX}/tours?sort=rating&pageSize=50`).expect(200);
      expect(slugs(rating.body.items)[0]).toBe("luxor-full-day-tour");
    });

    it("filters by destination, category and price", async () => {
      const giza = await api(t).get(`${PREFIX}/tours?destination=giza&pageSize=50`).expect(200);
      expect(slugs(giza.body.items).sort()).toEqual(["giza-pyramids-sunset", "pyramids-sphinx-tour"]);

      const history = await api(t).get(`${PREFIX}/tours?categories=HISTORY_CULTURE&pageSize=50`).expect(200);
      expect(slugs(history.body.items).sort()).toEqual(["aswan-felucca-philae", "luxor-full-day-tour", "pyramids-sphinx-tour"]);

      const water = await api(t).get(`${PREFIX}/tours?categories=WATER_ACTIVITIES`).expect(200);
      expect(slugs(water.body.items)).toEqual(["red-sea-snorkeling-adventure"]);

      const cheap = await api(t).get(`${PREFIX}/tours?maxPrice=800&pageSize=50`).expect(200);
      expect(slugs(cheap.body.items).sort()).toEqual(["giza-pyramids-sunset", "nile-dinner-cruise"]);
    });

    it("filters by duration band", async () => {
      const short = await api(t).get(`${PREFIX}/tours?durations=short`).expect(200);
      expect(slugs(short.body.items)).toEqual(["nile-dinner-cruise"]);
      const half = await api(t).get(`${PREFIX}/tours?durations=half&pageSize=50`).expect(200);
      expect(slugs(half.body.items).sort()).toEqual([
        "aswan-felucca-philae", "giza-pyramids-sunset", "pyramids-sphinx-tour", "red-sea-snorkeling-adventure",
      ]);
      const full = await api(t).get(`${PREFIX}/tours?durations=full`).expect(200);
      expect(slugs(full.body.items)).toEqual(["luxor-full-day-tour"]);
      const shortOrFull = await api(t).get(`${PREFIX}/tours?durations=short,full&pageSize=50`).expect(200);
      expect(slugs(shortOrFull.body.items).sort()).toEqual(["luxor-full-day-tour", "nile-dinner-cruise"]);
    });

    it("filters by group size and minimum rating", async () => {
      const group = await api(t).get(`${PREFIX}/tours?guests=11&pageSize=50`).expect(200);
      expect(slugs(group.body.items).sort()).toEqual(["nile-dinner-cruise", "pyramids-sphinx-tour", "red-sea-snorkeling-adventure"]);
      const rated = await api(t).get(`${PREFIX}/tours?minRating=4.8&pageSize=50`).expect(200);
      expect(slugs(rated.body.items).sort()).toEqual(["aswan-felucca-philae", "luxor-full-day-tour", "pyramids-sphinx-tour"]);
    });

    it("keeps only tours with an open, future departure on a given date", async () => {
      const day = await nextTourSessionDay(t.prisma, "nile-dinner-cruise");
      const onDay = await api(t).get(`${PREFIX}/tours?date=${day}&pageSize=50`).expect(200);
      expect(slugs(onDay.body.items)).toContain("nile-dinner-cruise");
      // No seeded departures in the year 2099.
      const later = await api(t).get(`${PREFIX}/tours?date=2099-01-01`).expect(200);
      expect(later.body.items).toEqual([]);
      // A date in the past is rejected, not silently emptied.
      expectProblem(await api(t).get(`${PREFIX}/tours?date=${isoDay(-1)}`), 422, "VALIDATION_FAILED");
    });

    it("combines filters with paging", async () => {
      const res = await api(t).get(`${PREFIX}/tours?categories=HISTORY_CULTURE&sort=price-asc&page=2&pageSize=2`).expect(200);
      expect(res.body.meta).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
      expect(slugs(res.body.items)).toEqual(["luxor-full-day-tour"]);
    });

    it("returns an empty page when nothing matches", async () => {
      const res = await api(t).get(`${PREFIX}/tours?minRating=5&pageSize=50`).expect(200);
      expect(res.body.items).toEqual([]);
      expect(res.body.meta.totalPages).toBe(0);
    });

    it("returns a list item with the public shape and a cover", async () => {
      const res = await api(t).get(`${PREFIX}/tours?destination=giza`).expect(200);
      const tour = res.body.items.find((x: { slug: string }) => x.slug === "pyramids-sphinx-tour");
      expect(tour).toMatchObject({
        title: "Pyramids & Sphinx Tour",
        category: "HISTORY_CULTURE",
        durationMinutes: 300,
        maxGroupSize: 12,
        rating: { average: "4.8", reviewCount: 1542 },
        fromPricePerPerson: { amount: "950.00", currency: "EGP" },
        destination: { slug: "giza", name: "Giza" },
      });
      expect(keysOf(tour.image)).toEqual([...PUBLIC_IMAGE_KEYS].sort());
    });

    it("rejects invalid filters and parameters with 422", async () => {
      const cases = [
        "categories=NOPE", "durations=weekly", "sort=popular", "minRating=6", "guests=41",
        "maxPrice=-5", "date=2026-02-30", "date=2026/10/10", "destination=Giza", "page=0", "bogus=1",
      ];
      for (const query of cases) {
        expectProblem(await api(t).get(`${PREFIX}/tours?${query}`), 422, "VALIDATION_FAILED");
      }
    });
  });

  describe("detail", () => {
    it("returns the full tour with a computed itinerary offset per step", async () => {
      const res = await api(t).get(`${PREFIX}/tours/pyramids-sphinx-tour`).expect(200);
      expect(res.body).toMatchObject({
        slug: "pyramids-sphinx-tour",
        meetingPoint: "Hotel lobby pick-up, or the Pyramids Gate at the plateau entrance.",
        fromPricePerPerson: { amount: "950.00", currency: "EGP" },
        cancellationPolicy: expect.objectContaining({ code: "tour-24h" }),
      });
      expect(res.body.itinerary.map((s: { offsetMinutes: number }) => s.offsetMinutes)).toEqual([0, 45, 120, 210, 270]);
      expect(res.body.images).toHaveLength(3);
      // Clock time as the frontend shows it, plus the offset from the first step.
      expect(res.body.itinerary[0]).toEqual({
        time: "08:00",
        offsetMinutes: 0,
        title: "Hotel pick-up",
        description: expect.any(String),
      });
    });

    it("returns 404 for the archived tour and unknown slugs", async () => {
      expectProblem(await api(t).get(`${PREFIX}/tours/hidden-archived-tour`), 404, "NOT_FOUND");
      expectProblem(await api(t).get(`${PREFIX}/tours/no-such-tour`), 404, "NOT_FOUND");
    });

    it("resolves by UUID", async () => {
      const list = await api(t).get(`${PREFIX}/tours?destination=luxor`).expect(200);
      const res = await api(t).get(`${PREFIX}/tours/${list.body.items[0].id as string}`).expect(200);
      expect(res.body.slug).toBe("luxor-full-day-tour");
    });
  });

  describe("sessions", () => {
    it("lists open, future sessions in a window with remaining seats", async () => {
      const day = await nextTourSessionDay(t.prisma, "nile-dinner-cruise");
      const res = await api(t).get(`${PREFIX}/tours/nile-dinner-cruise/sessions?from=${day}&to=${day}`).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toEqual({
        id: expect.any(String),
        startsAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        remainingUnits: 40,
        pricePerPerson: null,
      });
      expect(new Date(res.body[0].startsAt as string).getTime()).toBeGreaterThan(Date.now());
    });

    it("rejects a search window that starts in the past", async () => {
      // The seeded open session dated 2025-06-01 has already started, and the window that would show it is refused.
      expectProblem(
        await api(t).get(`${PREFIX}/tours/nile-dinner-cruise/sessions?from=2025-05-01&to=2025-06-30`),
        422,
        "VALIDATION_FAILED",
      );
    });

    it("does not offer closed sessions", async () => {
      const closed = await t.prisma.tourSession.findFirstOrThrow({
        where: { tour: { slug: "nile-dinner-cruise" }, status: "CLOSED" },
      });
      const day = closed.startsAt.toISOString().slice(0, 10);
      const res = await api(t).get(`${PREFIX}/tours/nile-dinner-cruise/sessions?from=${day}&to=${day}`).expect(200);
      expect(res.body).toEqual([]);
    });

    it("filters by number of participants", async () => {
      const day = await nextTourSessionDay(t.prisma, "nile-dinner-cruise");
      const fits = await api(t).get(`${PREFIX}/tours/nile-dinner-cruise/sessions?from=${day}&to=${day}&participants=40`).expect(200);
      expect(fits.body).toHaveLength(1);
      // Groups above the largest tour (40) are rejected before the query runs.
      expectProblem(
        await api(t).get(`${PREFIX}/tours/nile-dinner-cruise/sessions?from=${day}&to=${day}&participants=41`),
        422,
        "VALIDATION_FAILED",
      );
      // A valid group size that exceeds this tour's remaining seats (capacity 12) is filtered out.
      const day2 = await nextTourSessionDay(t.prisma, "pyramids-sphinx-tour");
      const tooBig = await api(t).get(`${PREFIX}/tours/pyramids-sphinx-tour/sessions?from=${day2}&to=${day2}&participants=13`).expect(200);
      expect(tooBig.body).toEqual([]);
    });

    it("returns an empty list for a window with no departures", async () => {
      const res = await api(t).get(`${PREFIX}/tours/nile-dinner-cruise/sessions?from=2099-01-01&to=2099-01-07`).expect(200);
      expect(res.body).toEqual([]);
    });

    it("validates the window: order, length and dates", async () => {
      const day = isoDay(0);
      expectProblem(await api(t).get(`${PREFIX}/tours/nile-dinner-cruise/sessions?from=${isoDay(5)}&to=${day}`), 422, "VALIDATION_FAILED");
      expectProblem(await api(t).get(`${PREFIX}/tours/nile-dinner-cruise/sessions?from=${day}&to=${isoDay(91)}`), 422, "VALIDATION_FAILED");
      expectProblem(await api(t).get(`${PREFIX}/tours/nile-dinner-cruise/sessions?from=2026-02-30&to=2026-03-01`), 422, "VALIDATION_FAILED");
      expectProblem(await api(t).get(`${PREFIX}/tours/nile-dinner-cruise/sessions?from=${day}`), 422, "VALIDATION_FAILED");
      expectProblem(await api(t).get(`${PREFIX}/tours/nile-dinner-cruise/sessions?from=${day}&to=${day}&participants=0`), 422, "VALIDATION_FAILED");
    });

    it("accepts a 90-day window and returns 404 for unpublished tours", async () => {
      await api(t).get(`${PREFIX}/tours/nile-dinner-cruise/sessions?from=${isoDay(0)}&to=${isoDay(89)}`).expect(200);
      expectProblem(await api(t).get(`${PREFIX}/tours/hidden-archived-tour/sessions?from=${isoDay(0)}&to=${isoDay(1)}`), 404, "NOT_FOUND");
    });

    it("sessions of the seeded schedule match the tour's start times", async () => {
      const day = await nextTourSessionDay(t.prisma, "pyramids-sphinx-tour");
      const res = await api(t).get(`${PREFIX}/tours/pyramids-sphinx-tour/sessions?from=${day}&to=${day}`).expect(200);
      // Pyramids runs at 08:00, 09:00 and 14:00 Cairo time, whatever the season.
      const hours = res.body.map((s: { startsAt: string }) => cairoHour(new Date(s.startsAt)));
      expect(hours.length).toBeGreaterThan(0);
      expect(hours.every((h: number) => [8, 9, 14].includes(h))).toBe(true);
    });
  });
});
