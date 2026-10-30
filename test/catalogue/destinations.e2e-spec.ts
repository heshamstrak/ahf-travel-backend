import { createTestApp, TestApp } from "../support/app";
import { api, expectProblem, keysOf, loadCatalogue, PREFIX, PUBLIC_IMAGE_KEYS } from "./support";

describe("Destinations API (integration)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await loadCatalogue(t.prisma);
  });

  afterAll(async () => {
    await t.close();
  });

  it("lists only published destinations in sort order, with paging meta", async () => {
    const res = await api(t).get(`${PREFIX}/destinations`).expect(200);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 20, total: 6, totalPages: 1 });
    expect(res.body.items.map((d: { slug: string }) => d.slug)).toEqual([
      "cairo", "giza", "sharm-el-sheikh", "hurghada", "luxor", "aswan",
    ]);
  });

  it("never lists a draft destination", async () => {
    const res = await api(t).get(`${PREFIX}/destinations`).expect(200);
    expect(res.body.items.map((d: { slug: string }) => d.slug)).not.toContain("hidden-siwa");
  });

  it("filters featured destinations and their complement", async () => {
    const featured = await api(t).get(`${PREFIX}/destinations?featured=true`).expect(200);
    expect(featured.body.items.map((d: { slug: string }) => d.slug)).toEqual(["cairo"]);
    const other = await api(t).get(`${PREFIX}/destinations?featured=false`).expect(200);
    expect(other.body.meta.total).toBe(5);
  });

  it("searches names case-insensitively and returns an empty page for no match", async () => {
    const found = await api(t).get(`${PREFIX}/destinations?q=GIZ`).expect(200);
    expect(found.body.items.map((d: { name: string }) => d.name)).toEqual(["Giza"]);
    const none = await api(t).get(`${PREFIX}/destinations?q=zzz-no-match`).expect(200);
    expect(none.body).toEqual({ items: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
  });

  it("sorts by name when asked", async () => {
    const res = await api(t).get(`${PREFIX}/destinations?sort=name`).expect(200);
    expect(res.body.items.map((d: { name: string }) => d.name)).toEqual([
      "Aswan", "Cairo", "Giza", "Hurghada", "Luxor", "Sharm El Sheikh",
    ]);
  });

  it("pages with stable boundaries and returns an empty page past the end", async () => {
    const first = await api(t).get(`${PREFIX}/destinations?page=1&pageSize=4`).expect(200);
    expect(first.body.items).toHaveLength(4);
    expect(first.body.meta.totalPages).toBe(2);
    const second = await api(t).get(`${PREFIX}/destinations?page=2&pageSize=4`).expect(200);
    expect(second.body.items.map((d: { slug: string }) => d.slug)).toEqual(["luxor", "aswan"]);
    const beyond = await api(t).get(`${PREFIX}/destinations?page=3&pageSize=4`).expect(200);
    expect(beyond.body.items).toEqual([]);
  });

  it("rejects invalid paging, sort and unknown query parameters with 422", async () => {
    for (const path of [
      "page=0",
      "page=abc",
      "pageSize=51",
      "pageSize=0",
      "sort=popularity",
      "bogus=1",
      "featured=maybe",
    ]) {
      const res = await api(t).get(`${PREFIX}/destinations?${path}`);
      expectProblem(res, 422, "VALIDATION_FAILED");
    }
  });

  it("returns product counts and a cover image for a destination detail by slug", async () => {
    const res = await api(t).get(`${PREFIX}/destinations/cairo`).expect(200);
    expect(res.body).toMatchObject({
      slug: "cairo",
      name: "Cairo",
      countryCode: "EG",
      isFeatured: true,
      // One sellable hotel (Four Seasons). The unsellable and deleted hotels do not count.
      productCounts: { hotels: 1, tours: 1, packages: 3 },
    });
    expect(keysOf(res.body.image)).toEqual([...PUBLIC_IMAGE_KEYS].sort());
    expect(res.body.image.isCover).toBe(true);
  });

  it("counts each product type per destination from the catalogue", async () => {
    const giza = await api(t).get(`${PREFIX}/destinations/giza`).expect(200);
    expect(giza.body.productCounts).toEqual({ hotels: 1, tours: 2, packages: 1 });
    const luxor = await api(t).get(`${PREFIX}/destinations/luxor`).expect(200);
    // The archived desert safari is not counted.
    expect(luxor.body.productCounts).toEqual({ hotels: 1, tours: 1, packages: 2 });
    const hurghada = await api(t).get(`${PREFIX}/destinations/hurghada`).expect(200);
    expect(hurghada.body.productCounts).toEqual({ hotels: 2, tours: 1, packages: 2 });
  });

  it("resolves a destination by UUID as well as by slug", async () => {
    const list = await api(t).get(`${PREFIX}/destinations?q=cairo`).expect(200);
    const id = list.body.items[0].id as string;
    const res = await api(t).get(`${PREFIX}/destinations/${id}`).expect(200);
    expect(res.body.slug).toBe("cairo");
  });

  it("returns 404 for unknown, draft and well-formed-but-missing identifiers", async () => {
    expectProblem(await api(t).get(`${PREFIX}/destinations/nowhere`), 404, "NOT_FOUND");
    expectProblem(await api(t).get(`${PREFIX}/destinations/hidden-siwa`), 404, "NOT_FOUND");
    expectProblem(
      await api(t).get(`${PREFIX}/destinations/00000000-0000-4000-8000-000000000000`),
      404,
      "NOT_FOUND",
    );
  });

  it("rejects a malformed identifier with 422, not 404", async () => {
    expectProblem(await api(t).get(`${PREFIX}/destinations/Cairo`), 422, "VALIDATION_FAILED");
    expectProblem(await api(t).get(`${PREFIX}/destinations/not%20valid`), 422, "VALIDATION_FAILED");
  });
});
