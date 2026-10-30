import { randomUUID } from "crypto";
import { createTestApp, TestApp } from "../support/app";
import { loadCatalogue } from "../catalogue/support";
import { ADMIN, api, asAdmin, catalogueIds, createAdmin, createUser, signIn } from "./support";

function pngBuffer(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
}

describe("Admin media upload and public serving (integration)", () => {
  let t: TestApp;
  let ids: Awaited<ReturnType<typeof catalogueIds>>;
  let adminToken: string;
  let customerToken: string;
  let throwawayHotelId: string;

  beforeAll(async () => {
    t = await createTestApp();
    await loadCatalogue(t.prisma);
    ids = await catalogueIds(t.prisma);
    adminToken = await signIn(t, await createAdmin(t, "media-admin"));
    customerToken = await signIn(t, await createUser(t.prisma, "media-customer"));

    // A dedicated, DRAFT (never published) throwaway hotel: media upload only requires the owner
    // row to exist, never that it be publicly visible, so this never leaks into the seeded Mena
    // House hotel's gallery that catalogue/hotels.e2e-spec.ts asserts an exact count over.
    const room = await t.prisma.room.findUniqueOrThrow({ where: { id: ids.flexPyramidRate.roomId } });
    const hotel = await t.prisma.hotel.findUniqueOrThrow({ where: { id: room.hotelId } });
    const created = await asAdmin(t, adminToken).post(`${ADMIN}/hotels`).send({
      slug: `media-test-hotel-${randomUUID().slice(0, 8)}`,
      name: "Media Test Hotel",
      destinationId: hotel.destinationId,
      propertyType: "HOTEL",
      starRating: 3,
      addressLine: "1 Media Test Street",
      description: "A throwaway hotel for media tests",
      checkInTime: "14:00",
      checkOutTime: "12:00",
    });
    throwawayHotelId = created.body.id;
  });

  afterAll(async () => {
    await t.close();
  });

  function hotelIdFor(): string {
    return throwawayHotelId;
  }

  it("rejects an upload from a non-admin customer", async () => {
    const hotelId = hotelIdFor();
    const res = await api(t)
      .post(`${ADMIN}/media`)
      .set("Authorization", `Bearer ${customerToken}`)
      .field("ownerType", "HOTEL")
      .field("ownerId", hotelId)
      .attach("file", pngBuffer(), "cover.png");
    expect(res.status).toBe(403);
  });

  it("rejects uploading against an owner id that does not exist", async () => {
    const res = await asAdmin(t, adminToken)
      .post(`${ADMIN}/media`)
      .field("ownerType", "HOTEL")
      .field("ownerId", "00000000-0000-0000-0000-000000000000")
      .attach("file", pngBuffer(), "cover.png");
    expect(res.status).toBe(404);
  });

  it("rejects a PAYMENT_PROOF upload through the general admin endpoint", async () => {
    const hotelId = hotelIdFor();
    const res = await asAdmin(t, adminToken).post(`${ADMIN}/media`).field("ownerType", "PAYMENT_PROOF").field("ownerId", hotelId).attach("file", pngBuffer(), "x.png");
    expect(res.status).toBe(422);
  });

  it("rejects content whose bytes do not match any allowed image type", async () => {
    const hotelId = hotelIdFor();
    const res = await asAdmin(t, adminToken)
      .post(`${ADMIN}/media`)
      .field("ownerType", "HOTEL")
      .field("ownerId", hotelId)
      .attach("file", Buffer.from("not an image"), "fake.png");
    expect(res.status).toBe(422);
  });

  it("uploads a valid image, serves it back publicly, and lets the admin update/remove it", async () => {
    const hotelId = hotelIdFor();
    const upload = await asAdmin(t, adminToken)
      .post(`${ADMIN}/media`)
      .field("ownerType", "HOTEL")
      .field("ownerId", hotelId)
      .field("isCover", "true")
      .attach("file", pngBuffer(), "cover.png");
    expect(upload.status).toBe(201);
    expect(upload.body.isCover).toBe(true);
    expect(upload.body.url).toMatch(/^\/api\/v1\/media\/public-media\//);

    // Served back unauthenticated — this is public catalogue content, not a private receipt.
    const served = await api(t).get(upload.body.url as string);
    expect(served.status).toBe(200);
    expect(served.headers["content-type"]).toBe("image/png");
    // helmet's secure default would otherwise block every <img> load from a different
    // origin/port than this API (the admin dashboard and the customer site both are, in dev).
    expect(served.headers["cross-origin-resource-policy"]).toBe("cross-origin");

    const update = await asAdmin(t, adminToken).patch(`${ADMIN}/media/${upload.body.id}`).send({ altText: "Updated alt text", sortOrder: 2 });
    expect(update.status).toBe(200);
    expect(update.body.altText).toBe("Updated alt text");

    const remove = await asAdmin(t, adminToken).delete(`${ADMIN}/media/${upload.body.id}`);
    expect(remove.status).toBe(200);

    const afterRemoval = await asAdmin(t, adminToken).patch(`${ADMIN}/media/${upload.body.id}`).send({ altText: "x" });
    expect(afterRemoval.status).toBe(404);
  });

  it("replaces a media file's bytes in place, keeping its id, cover flag and sort order", async () => {
    const hotelId = hotelIdFor();
    const upload = await asAdmin(t, adminToken)
      .post(`${ADMIN}/media`)
      .field("ownerType", "HOTEL")
      .field("ownerId", hotelId)
      .field("isCover", "true")
      .attach("file", pngBuffer(), "cover.png");
    expect(upload.status).toBe(201);
    const originalUrl = upload.body.url as string;

    const replaced = await asAdmin(t, adminToken).patch(`${ADMIN}/media/${upload.body.id}/file`).attach("file", pngBuffer(), "new-cover.png");
    expect(replaced.status).toBe(200);
    expect(replaced.body.id).toBe(upload.body.id);
    expect(replaced.body.isCover).toBe(true);
    expect(replaced.body.sortOrder).toBe(upload.body.sortOrder);
    expect(replaced.body.url).not.toBe(originalUrl);

    const served = await api(t).get(replaced.body.url as string);
    expect(served.status).toBe(200);
    // The old object is left in place (no storage-delete primitive), but the Media row no longer
    // points at it, so it is never served back as this image again.
    const oldServed = await api(t).get(originalUrl);
    expect(oldServed.status).toBe(200);
  });

  it("rejects a file replacement with content that does not match any allowed image type", async () => {
    const hotelId = hotelIdFor();
    const upload = await asAdmin(t, adminToken).post(`${ADMIN}/media`).field("ownerType", "HOTEL").field("ownerId", hotelId).attach("file", pngBuffer(), "cover.png");
    const replaced = await asAdmin(t, adminToken).patch(`${ADMIN}/media/${upload.body.id}/file`).attach("file", Buffer.from("not an image"), "fake.png");
    expect(replaced.status).toBe(422);
  });

  it("rejects a non-admin caller replacing a file", async () => {
    const hotelId = hotelIdFor();
    const upload = await asAdmin(t, adminToken).post(`${ADMIN}/media`).field("ownerType", "HOTEL").field("ownerId", hotelId).attach("file", pngBuffer(), "cover.png");
    const res = await api(t).patch(`${ADMIN}/media/${upload.body.id}/file`).attach("file", pngBuffer(), "new.png");
    expect(res.status).toBe(401);
  });

  /** A throwaway IMPORTED_EXTERNAL row against the dedicated media-test hotel — never a real seeded
   *  row. Mutating a real seeded row (even one picked via `findFirst`) would permanently flip it
   *  over to a local upload in the shared, non-reset test database, breaking any other spec that
   *  assumes seeded catalogue images are always externally-hosted (e.g.
   *  catalogue/safety-and-performance.e2e-spec.ts's "every public image is https" check). */
  async function createImportedExternalFixture() {
    return t.prisma.media.create({
      data: {
        id: randomUUID(),
        ownerType: "HOTEL",
        ownerId: hotelIdFor(),
        storageKey: `ext/HOTEL/media-test/${randomUUID()}`,
        variants: {},
        mimeType: "image/jpeg",
        width: 0,
        height: 0,
        sizeBytes: 0,
        altText: "Imported external fixture",
        source: "IMPORTED_EXTERNAL",
        sourceUrl: "https://example.invalid/fixture.jpg",
        attribution: "Test fixture",
        licenseCode: "UNVERIFIED-COMMONS",
        status: "READY",
        isCover: false,
        sortOrder: 99,
      },
    });
  }

  it("lists an imported-external image's own source URL (its storage key is a synthetic reference, never a real stored file)", async () => {
    const seeded = await createImportedExternalFixture();
    const res = await asAdmin(t, adminToken).get(`${ADMIN}/media`).query({ ownerType: seeded.ownerType, ownerId: seeded.ownerId });
    expect(res.status).toBe(200);
    const row = res.body.find((m: { id: string }) => m.id === seeded.id);
    expect(row).toBeDefined();
    expect(row.url).toBe(seeded.sourceUrl);
  });

  it("replacing an imported-external image's file switches it over to serving the new upload, not the old external source", async () => {
    const seeded = await createImportedExternalFixture();
    const replaced = await asAdmin(t, adminToken).patch(`${ADMIN}/media/${seeded.id}/file`).attach("file", pngBuffer(), "replacement.png");
    expect(replaced.status).toBe(200);
    expect(replaced.body.url).toMatch(/^\/api\/v1\/media\/public-media\//);
    expect(replaced.body.url).not.toBe(seeded.sourceUrl);

    const served = await api(t).get(replaced.body.url as string);
    expect(served.status).toBe(200);
    expect(served.headers["content-type"]).toBe("image/png");
  });

  it("setting a new cover image unsets the previous one for the same owner", async () => {
    const hotelId = hotelIdFor();
    const first = await asAdmin(t, adminToken).post(`${ADMIN}/media`).field("ownerType", "HOTEL").field("ownerId", hotelId).field("isCover", "true").attach("file", pngBuffer(), "a.png");
    const second = await asAdmin(t, adminToken).post(`${ADMIN}/media`).field("ownerType", "HOTEL").field("ownerId", hotelId).field("isCover", "true").attach("file", pngBuffer(), "b.png");
    expect(second.body.isCover).toBe(true);

    const firstRow = await t.prisma.media.findUniqueOrThrow({ where: { id: first.body.id } });
    expect(firstRow.isCover).toBe(false);
  });

  describe("GET /admin/media (gallery listing, used by the admin UI's image manager)", () => {
    it("rejects a non-admin caller", async () => {
      const res = await api(t).get(`${ADMIN}/media`).set("Authorization", `Bearer ${customerToken}`).query({ ownerType: "HOTEL", ownerId: hotelIdFor() });
      expect(res.status).toBe(403);
    });

    it("lists only this owner's non-deleted images, cover first, in sort order", async () => {
      const room = await t.prisma.room.findUniqueOrThrow({ where: { id: (await catalogueIds(t.prisma)).flexPyramidRate.roomId } });
      const parentHotel = await t.prisma.hotel.findUniqueOrThrow({ where: { id: room.hotelId } });
      const created = await asAdmin(t, adminToken)
        .post(`${ADMIN}/hotels`)
        .send({
          slug: `media-list-hotel-${randomUUID().slice(0, 8)}`,
          name: "Media List Test Hotel",
          destinationId: parentHotel.destinationId,
          propertyType: "HOTEL",
          starRating: 3,
          addressLine: "2 Media Test Street",
          description: "A throwaway hotel for the media listing test",
          checkInTime: "14:00",
          checkOutTime: "12:00",
        });
      const ownHotelId = created.body.id as string;

      const empty = await asAdmin(t, adminToken).get(`${ADMIN}/media`).query({ ownerType: "HOTEL", ownerId: ownHotelId });
      expect(empty.status).toBe(200);
      expect(empty.body).toEqual([]);

      const first = await asAdmin(t, adminToken).post(`${ADMIN}/media`).field("ownerType", "HOTEL").field("ownerId", ownHotelId).attach("file", pngBuffer(), "first.png");
      const second = await asAdmin(t, adminToken).post(`${ADMIN}/media`).field("ownerType", "HOTEL").field("ownerId", ownHotelId).attach("file", pngBuffer(), "second.png");
      await asAdmin(t, adminToken).patch(`${ADMIN}/media/${second.body.id}`).send({ isCover: true });
      await asAdmin(t, adminToken).delete(`${ADMIN}/media/${first.body.id}`);
      const third = await asAdmin(t, adminToken).post(`${ADMIN}/media`).field("ownerType", "HOTEL").field("ownerId", ownHotelId).attach("file", pngBuffer(), "third.png");

      const list = await asAdmin(t, adminToken).get(`${ADMIN}/media`).query({ ownerType: "HOTEL", ownerId: ownHotelId });
      expect(list.status).toBe(200);
      // the deleted "first" image is excluded; the cover ("second") sorts ahead of "third"
      expect(list.body.map((m: { id: string }) => m.id)).toEqual([second.body.id, third.body.id]);
      expect(list.body[0].isCover).toBe(true);

      // never leaks another owner's gallery
      const otherOwner = await asAdmin(t, adminToken).get(`${ADMIN}/media`).query({ ownerType: "HOTEL", ownerId: hotelIdFor() });
      expect(otherOwner.body.map((m: { id: string }) => m.id)).not.toContain(second.body.id);
    });

    it("rejects an invalid owner type", async () => {
      const res = await asAdmin(t, adminToken).get(`${ADMIN}/media`).query({ ownerType: "NOT_A_TYPE", ownerId: hotelIdFor() });
      expect(res.status).toBe(422);
    });
  });

  describe("GET /media/*key (public serving)", () => {
    it("carries the cross-origin-allow header even on a 404, so a broken image reference fails as a clean 404 in the browser instead of being swallowed as an opaque cross-origin block", async () => {
      const res = await api(t).get("/api/v1/media/not-a-real-key.png");
      expect(res.status).toBe(404);
      expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    });
  });
});
