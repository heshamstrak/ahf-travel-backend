import { createTestApp, TestApp } from "../support/app";
import { api, expectProblem, isoDay, itemsAs, loadCatalogue, PREFIX } from "./support";

interface HotelItem {
  slug: string;
  starRating: number;
  propertyType: string;
  fromPricePerNight: { amount: string; currency: string } | null;
}

const slugs = (items: unknown) => itemsAs<{ slug: string }>(items).map((h) => h.slug);

describe("Hotels API (integration)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await loadCatalogue(t.prisma);
  });

  afterAll(async () => {
    await t.close();
  });

  describe("search", () => {
    it("lists every published hotel in a published destination, sellable or not", async () => {
      const res = await api(t).get(`${PREFIX}/hotels?pageSize=50`).expect(200);
      expect(res.body.meta.total).toBe(8);
      const list = slugs(res.body.items);
      expect(list).toEqual(expect.arrayContaining([
        "marriott-mena-house", "four-seasons-cairo", "steigenberger-alcazar", "rixos-premium-seagate",
        "sheraton-hurghada", "sofitel-winter-palace", "old-cataract-aswan",
        // Published but not yet sellable (no priced room) — still listed, just with no price; see
        // the "shows a published hotel with no sellable rate" tests below.
        "hidden-unsellable-hotel",
      ]));
      // Draft, soft-deleted and draft-destination hotels never appear.
      for (const hidden of ["hidden-draft-lodge", "hidden-deleted-hotel", "hidden-siwa-lodge"]) {
        expect(list).not.toContain(hidden);
      }
    });

    it("lists a published hotel with no sellable rate with a null price, not an error or a zero", async () => {
      const res = await api(t).get(`${PREFIX}/hotels?pageSize=50`).expect(200);
      const unsellable = (res.body.items as HotelItem[]).find((h) => h.slug === "hidden-unsellable-hotel");
      expect(unsellable).toBeDefined();
      expect(unsellable!.fromPricePerNight).toBeNull();
    });

    it("excludes an unpriced hotel from a maxPrice-filtered search (an unknown price can never be 'under' a cap)", async () => {
      const res = await api(t).get(`${PREFIX}/hotels?pageSize=50&maxPrice=999999`).expect(200);
      expect(slugs(res.body.items)).not.toContain("hidden-unsellable-hotel");
    });

    it("reports the cheapest published nightly rate per hotel", async () => {
      const res = await api(t).get(`${PREFIX}/hotels?sort=price-asc&pageSize=50`).expect(200);
      const prices = Object.fromEntries(
        (res.body.items as HotelItem[]).map((h) => [h.slug, h.fromPricePerNight?.amount]),
      );
      expect(prices).toMatchObject({
        "marriott-mena-house": "5200.00",
        "four-seasons-cairo": "8200.00",
        "old-cataract-aswan": "6100.00",
        "sheraton-hurghada": "3900.00",
      });
      expect(res.body.items[0].fromPricePerNight).toEqual({ amount: "3900.00", currency: "EGP" });
    });

    it("sorts by price ascending and descending, with the unpriced hotel always last (NULLS LAST either way)", async () => {
      const asc = await api(t).get(`${PREFIX}/hotels?sort=price-asc&pageSize=50`).expect(200);
      expect(slugs(asc.body.items)).toEqual([
        "sheraton-hurghada", "steigenberger-alcazar", "sofitel-winter-palace", "marriott-mena-house",
        "rixos-premium-seagate", "old-cataract-aswan", "four-seasons-cairo", "hidden-unsellable-hotel",
      ]);
      const desc = await api(t).get(`${PREFIX}/hotels?sort=price-desc&pageSize=50`).expect(200);
      expect(slugs(desc.body.items)[0]).toBe("four-seasons-cairo");
      expect(slugs(desc.body.items).at(-1)).toBe("hidden-unsellable-hotel");
      expect(slugs(desc.body.items).at(-2)).toBe("sheraton-hurghada");
    });

    it("sorts by rating and by stars", async () => {
      const rating = await api(t).get(`${PREFIX}/hotels?sort=rating&pageSize=50`).expect(200);
      expect(slugs(rating.body.items)[0]).toBe("four-seasons-cairo");
      const stars = await api(t).get(`${PREFIX}/hotels?sort=stars&pageSize=50`).expect(200);
      expect(stars.body.items).toHaveLength(8);
    });

    it("filters by destination slug", async () => {
      const hurghada = await api(t).get(`${PREFIX}/hotels?destination=hurghada`).expect(200);
      expect(slugs(hurghada.body.items).sort()).toEqual(["rixos-premium-seagate", "sheraton-hurghada"]);
      const draft = await api(t).get(`${PREFIX}/hotels?destination=hidden-siwa`).expect(200);
      expect(draft.body.items).toEqual([]);
    });

    it("filters by star rating, including a comma list", async () => {
      const five = await api(t).get(`${PREFIX}/hotels?stars=5&pageSize=50`).expect(200);
      expect(five.body.meta.total).toBe(7);
      // hidden-unsellable-hotel is 3 stars — published, so it correctly matches this filter even
      // though it has no price yet.
      const three = await api(t).get(`${PREFIX}/hotels?stars=3`).expect(200);
      expect(slugs(three.body.items)).toEqual(["hidden-unsellable-hotel"]);
      const none = await api(t).get(`${PREFIX}/hotels?stars=1`).expect(200);
      expect(none.body.items).toEqual([]);
    });

    it("filters by property type with label or code input", async () => {
      const resorts = await api(t).get(`${PREFIX}/hotels?propertyTypes=RESORT`).expect(200);
      expect(slugs(resorts.body.items).sort()).toEqual(["rixos-premium-seagate", "sheraton-hurghada", "steigenberger-alcazar"]);
      const hotels = await api(t).get(`${PREFIX}/hotels?propertyTypes=hotel`).expect(200);
      // 4 sellable + hidden-unsellable-hotel (also propertyType HOTEL, published, just unpriced).
      expect(hotels.body.meta.total).toBe(5);
    });

    it("applies amenities with AND semantics", async () => {
      const pool = await api(t).get(`${PREFIX}/hotels?amenities=Pool&pageSize=50`).expect(200);
      expect(slugs(pool.body.items).sort()).toEqual([
        "marriott-mena-house", "old-cataract-aswan", "sheraton-hurghada", "sofitel-winter-palace",
      ]);
      const poolAndSpa = await api(t).get(`${PREFIX}/hotels?amenities=Pool,Spa&pageSize=50`).expect(200);
      expect(slugs(poolAndSpa.body.items).sort()).toEqual([
        "marriott-mena-house", "old-cataract-aswan", "sofitel-winter-palace",
      ]);
    });

    it("filters by minimum guest rating", async () => {
      const res = await api(t).get(`${PREFIX}/hotels?minGuestRating=9&pageSize=50`).expect(200);
      expect(res.body.meta.total).toBe(5);
    });

    it("filters by maximum price using the cheapest published rate", async () => {
      const res = await api(t).get(`${PREFIX}/hotels?maxPrice=5000&pageSize=50`).expect(200);
      expect(slugs(res.body.items).sort()).toEqual(["sheraton-hurghada", "steigenberger-alcazar"]);
    });

    it("keeps only hotels with a room that fits the adults per room", async () => {
      // Four guests in one room: only the Family Suite and the Family Connecting Room qualify.
      const one = await api(t).get(`${PREFIX}/hotels?guests=4&rooms=1&pageSize=50`).expect(200);
      expect(slugs(one.body.items).sort()).toEqual(["four-seasons-cairo", "rixos-premium-seagate"]);
      // Four guests in two rooms: two adults per room, every hotel qualifies.
      const two = await api(t).get(`${PREFIX}/hotels?guests=4&rooms=2&pageSize=50`).expect(200);
      expect(two.body.meta.total).toBe(7);
    });

    it("combines filters, sorting and paging", async () => {
      const res = await api(t).get(
        `${PREFIX}/hotels?destination=hurghada&stars=5&minGuestRating=8.5&sort=price-desc&page=1&pageSize=1`,
      ).expect(200);
      expect(res.body.meta).toEqual({ page: 1, pageSize: 1, total: 2, totalPages: 2 });
      // Rixos (5400) is pricier than Sheraton (3900), so it leads the price-descending page.
      expect(slugs(res.body.items)).toEqual(["rixos-premium-seagate"]);
    });

    it("returns an empty page when filters match nothing", async () => {
      const res = await api(t).get(`${PREFIX}/hotels?maxPrice=1&pageSize=50`).expect(200);
      expect(res.body).toEqual({ items: [], meta: { page: 1, pageSize: 50, total: 0, totalPages: 0 } });
    });

    it("pages with stable boundaries", async () => {
      const page = await api(t).get(`${PREFIX}/hotels?sort=price-asc&page=2&pageSize=3`).expect(200);
      expect(slugs(page.body.items)).toEqual(["marriott-mena-house", "rixos-premium-seagate", "old-cataract-aswan"]);
      const past = await api(t).get(`${PREFIX}/hotels?page=9&pageSize=3`).expect(200);
      expect(past.body.items).toEqual([]);
    });

    it("echoes a valid stay without applying availability", async () => {
      const res = await api(t)
        .get(`${PREFIX}/hotels?checkIn=${isoDay(30)}&checkOut=${isoDay(32)}&guests=2&rooms=1&pageSize=1`)
        .expect(200);
      expect(res.body.items[0].stay).toEqual({ checkIn: isoDay(30), checkOut: isoDay(32), nights: 2, guests: 2, rooms: 1 });
    });

    it("rejects an invalid stay with 422", async () => {
      const cases = [
        `checkIn=${isoDay(30)}`,
        `checkOut=${isoDay(30)}`,
        `checkIn=2099-02-30&checkOut=2099-03-02`,
        `checkIn=${isoDay(-1)}&checkOut=${isoDay(2)}`,
        `checkIn=${isoDay(30)}&checkOut=${isoDay(30)}`,
        `checkIn=${isoDay(30)}&checkOut=${isoDay(61)}`,
      ];
      for (const query of cases) {
        expectProblem(await api(t).get(`${PREFIX}/hotels?${query}`), 422, "VALIDATION_FAILED");
      }
    });

    it("rejects out-of-range and malformed filters with 422", async () => {
      const cases = [
        "stars=6", "stars=0", "stars=5,5", "stars=abc",
        "maxPrice=-1", "maxPrice=abc", "minGuestRating=11",
        "propertyTypes=CASTLE", "amenities=" + "x".repeat(61),
        "guests=13", "guests=0", "rooms=7", "sort=cheapest",
        "destination=Hurghada", "bogus=1",
      ];
      for (const query of cases) {
        expectProblem(await api(t).get(`${PREFIX}/hotels?${query}`), 422, "VALIDATION_FAILED");
      }
    });

    it("returns list items with only public fields and a cover image", async () => {
      const res = await api(t).get(`${PREFIX}/hotels?destination=giza`).expect(200);
      const hotel = res.body.items[0];
      expect(hotel).toMatchObject({
        slug: "marriott-mena-house",
        propertyType: "HOTEL",
        starRating: 5,
        guestRating: { average: "9.2", reviewCount: 3120 },
        destination: { slug: "giza", name: "Giza" },
        fromPricePerNight: { amount: "5200.00", currency: "EGP" },
      });
      expect(hotel.image.isCover).toBe(true);
    });
  });

  describe("detail", () => {
    it("returns the hotel with its gallery and check times", async () => {
      const res = await api(t).get(`${PREFIX}/hotels/marriott-mena-house`).expect(200);
      expect(res.body).toMatchObject({
        slug: "marriott-mena-house",
        name: "Marriott Mena House",
        checkInTime: "14:00",
        checkOutTime: "12:00",
        fromPricePerNight: { amount: "5200.00", currency: "EGP" },
        guestRating: { average: "9.2", reviewCount: 3120 },
      });
      expect(res.body.images).toHaveLength(4);
      expect(res.body.images[0].isCover).toBe(true);
    });

    it("resolves by UUID as well as slug", async () => {
      const list = await api(t).get(`${PREFIX}/hotels?destination=giza`).expect(200);
      const res = await api(t).get(`${PREFIX}/hotels/${list.body.items[0].id as string}`).expect(200);
      expect(res.body.slug).toBe("marriott-mena-house");
    });

    it("returns 404 for drafts, deleted hotels and hotels in draft destinations", async () => {
      for (const slug of ["hidden-draft-lodge", "hidden-deleted-hotel", "hidden-siwa-lodge", "no-such-hotel"]) {
        expectProblem(await api(t).get(`${PREFIX}/hotels/${slug}`), 404, "NOT_FOUND");
      }
    });

    it("shows a published hotel with no sellable rate, without a price", async () => {
      // The page still exists; search does not list it because nothing can be sold.
      const res = await api(t).get(`${PREFIX}/hotels/hidden-unsellable-hotel`).expect(200);
      expect(res.body.fromPricePerNight).toBeNull();
    });

    it("rejects a malformed identifier with 422", async () => {
      expectProblem(await api(t).get(`${PREFIX}/hotels/Marriott`), 422, "VALIDATION_FAILED");
    });
  });

  describe("rooms", () => {
    it("lists published rooms with published rate plans, ordered by code", async () => {
      const res = await api(t).get(`${PREFIX}/hotels/marriott-mena-house/rooms`).expect(200);
      expect(res.body.map((r: { code: string }) => r.code)).toEqual(["mena-garden-twin", "mena-pyramid-view-king"]);
    });

    it("hides draft rooms", async () => {
      const res = await api(t).get(`${PREFIX}/hotels/four-seasons-cairo/rooms`).expect(200);
      expect(res.body.map((r: { code: string }) => r.code)).toEqual(["fs-family-suite", "fs-nile-king"]);
    });

    it("returns an empty list for a hotel with no sellable rooms", async () => {
      const res = await api(t).get(`${PREFIX}/hotels/hidden-unsellable-hotel/rooms`).expect(200);
      expect(res.body).toEqual([]);
    });

    it("lists refundable rate plans first and attaches the cancellation policy", async () => {
      const res = await api(t).get(`${PREFIX}/hotels/marriott-mena-house/rooms`).expect(200);
      const pyramid = res.body.find((r: { code: string }) => r.code === "mena-pyramid-view-king");
      expect(pyramid.ratePlans).toEqual([
        expect.objectContaining({
          code: "FLEX",
          isRefundable: true,
          currency: "EGP",
          basePricePerNight: "6800.00",
          cancellationPolicy: expect.objectContaining({ code: "hotel-flex-48h" }),
        }),
      ]);
      const twin = res.body.find((r: { code: string }) => r.code === "mena-garden-twin");
      expect(twin.ratePlans[0]).toMatchObject({ code: "NRF", isRefundable: false, basePricePerNight: "5200.00" });
      expect(twin.ratePlans[0].cancellationPolicy.code).toBe("hotel-non-refundable");
    });

    it("returns 404 for rooms of a hotel that is not public", async () => {
      expectProblem(await api(t).get(`${PREFIX}/hotels/hidden-draft-lodge/rooms`), 404, "NOT_FOUND");
    });
  });
});
