import { randomUUID } from "crypto";
import { createTestApp, TestApp } from "../support/app";
import { loadCatalogue } from "../catalogue/support";
import { ADMIN, api, asAdmin, catalogueIds, createAdmin, createPendingBooking, hotelQuoteBody, isoDay, PREFIX, setRoomFree, signIn } from "./support";

describe("Admin catalogue CRUD (integration)", () => {
  let t: TestApp;
  let ids: Awaited<ReturnType<typeof catalogueIds>>;
  let adminToken: string;
  let policyId: string;

  beforeAll(async () => {
    t = await createTestApp();
    await loadCatalogue(t.prisma);
    ids = await catalogueIds(t.prisma);
    adminToken = await signIn(t, await createAdmin(t, "crud-admin"));
    policyId = (await t.prisma.cancellationPolicy.findFirstOrThrow({})).id;
  });

  afterAll(async () => {
    await t.close();
  });

  const a = () => asAdmin(t, adminToken);

  describe("Destinations", () => {
    const slug = `test-dest-${randomUUID().slice(0, 8)}`;
    let id: string;

    it("creates a destination as DRAFT", async () => {
      const res = await a().post(`${ADMIN}/destinations`).send({ slug, name: "Test Destination", countryCode: "EG" });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe("DRAFT");
      id = res.body.id;
    });

    it("rejects a duplicate slug", async () => {
      const res = await a().post(`${ADMIN}/destinations`).send({ slug, name: "Another", countryCode: "EG" });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("SLUG_TAKEN");
    });

    it("updates fields and publishes it", async () => {
      const update = await a().patch(`${ADMIN}/destinations/${id}`).send({ name: "Updated Name" });
      expect(update.status).toBe(200);
      expect(update.body.name).toBe("Updated Name");

      const publish = await a().patch(`${ADMIN}/destinations/${id}/status`).send({ status: "PUBLISHED" });
      expect(publish.status).toBe(200);
      expect(publish.body.status).toBe("PUBLISHED");
    });

    it("refuses to delete a destination that still has an active hotel", async () => {
      const room = await t.prisma.room.findUniqueOrThrow({ where: { id: ids.flexPyramidRate.roomId } });
      const hotel = await t.prisma.hotel.findUniqueOrThrow({ where: { id: room.hotelId } });
      const res = await a().delete(`${ADMIN}/destinations/${hotel.destinationId}`);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("DESTINATION_IN_USE");
    });

    it("deletes (archives) a destination with nothing referencing it", async () => {
      const res = await a().delete(`${ADMIN}/destinations/${id}`);
      expect(res.status).toBe(204);
      const after = await a().get(`${ADMIN}/destinations/${id}`);
      expect(after.status).toBe(404);
    });
  });

  describe("Hotels, rooms and rate plans", () => {
    let destinationId: string;
    let destinationSlug: string;
    let hotelId: string;
    let roomId: string;

    beforeAll(async () => {
      destinationSlug = `hotel-admin-${randomUUID().slice(0, 8)}`;
      const dest = await a().post(`${ADMIN}/destinations`).send({ slug: destinationSlug, name: "Hotel Admin Dest", countryCode: "EG" });
      destinationId = dest.body.id;
      // Published so the public-listing regression test below (which needs a published
      // destination, same as every real catalogue destination) can use it directly.
      await a().patch(`${ADMIN}/destinations/${destinationId}/status`).send({ status: "PUBLISHED" });
    });

    afterAll(async () => {
      // Every hotel created against this destination in this block deletes itself by the end of
      // its own test, so this is always safe. Without it, a published "Hotel Admin Dest" row would
      // accumulate in the shared, never-reset test database on every re-run of this file and leak
      // into destinations.e2e-spec.ts's hardcoded public-destination-count assertions.
      await a().delete(`${ADMIN}/destinations/${destinationId}`);
    });

    it("creates a hotel", async () => {
      const res = await a().post(`${ADMIN}/hotels`).send({
        slug: `test-hotel-${randomUUID().slice(0, 8)}`,
        name: "Test Hotel",
        destinationId,
        propertyType: "HOTEL",
        starRating: 4,
        addressLine: "1 Test Street",
        description: "A test hotel",
        checkInTime: "14:00",
        checkOutTime: "12:00",
      });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe("DRAFT");
      hotelId = res.body.id;
    });

    it("creates a room under the hotel", async () => {
      const res = await a().post(`${ADMIN}/hotels/${hotelId}/rooms`).send({ code: "STD", name: "Standard Room", bedType: "Queen", baseOccupancy: 2, maxAdults: 2 });
      expect(res.status).toBe(201);
      roomId = res.body.id;
    });

    it("rejects a room whose base occupancy exceeds its max adults", async () => {
      const res = await a().post(`${ADMIN}/hotels/${hotelId}/rooms`).send({ code: "BAD", name: "Bad Room", bedType: "Queen", baseOccupancy: 5, maxAdults: 2 });
      expect(res.status).toBe(409);
    });

    it("rejects a rate plan referencing a cancellation policy that does not exist", async () => {
      const res = await a().post(`${ADMIN}/hotels/${hotelId}/rooms/${roomId}/rate-plans`).send({
        code: "FLEX",
        name: "Flexible",
        isRefundable: true,
        cancellationPolicyId: randomUUID(),
        currency: "EGP",
        basePricePerNight: "1000.00",
      });
      expect(res.status).toBe(404);
    });

    it("creates a rate plan with a real cancellation policy", async () => {
      const res = await a().post(`${ADMIN}/hotels/${hotelId}/rooms/${roomId}/rate-plans`).send({
        code: "FLEX",
        name: "Flexible",
        isRefundable: true,
        cancellationPolicyId: policyId,
        currency: "EGP",
        basePricePerNight: "1000.00",
      });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe("DRAFT");
    });

    it("lists this room in the standalone cross-hotel rooms table, with its hotel name and rate-plan count", async () => {
      const res = await a().get(`${ADMIN}/rooms`).query({ q: "Standard Room", pageSize: 50 });
      expect(res.status).toBe(200);
      const row = res.body.items.find((r: { id: string }) => r.id === roomId);
      expect(row).toBeDefined();
      expect(row.hotelId).toBe(hotelId);
      expect(row.ratePlanCount).toBe(1);
      expect(row.status).toBe("DRAFT");
    });

    it("filters the standalone rooms table by hotelId and by status", async () => {
      const byHotel = await a().get(`${ADMIN}/rooms`).query({ hotelId, pageSize: 50 });
      expect(byHotel.body.items).toHaveLength(1);

      const wrongStatus = await a().get(`${ADMIN}/rooms`).query({ hotelId, status: "PUBLISHED" });
      expect(wrongStatus.body.items).toHaveLength(0);
    });

    it("rejects a non-admin caller on the standalone rooms table", async () => {
      const res = await api(t).get(`${ADMIN}/rooms`);
      expect(res.status).toBe(401);
    });

    it("shows a newly admin-created, published hotel on the public listing immediately, with no price until a room+rate plan is published too, and hides it again once unpublished", async () => {
      // Regression test for a real bug: the public hotel search query excluded any hotel with no
      // sellable rate (no published room + published rate plan) from the LISTING entirely, even
      // though the hotel itself was PUBLISHED and its detail page resolved fine. An admin
      // publishing a brand-new hotel before finishing its rooms/pricing saw it vanish from
      // /hotels with no error and no indication why.
      const create = await a().post(`${ADMIN}/hotels`).send({
        slug: `admin-visibility-${randomUUID().slice(0, 8)}`,
        name: "Admin Visibility Regression Hotel",
        destinationId,
        propertyType: "HOTEL",
        starRating: 4,
        addressLine: "1 Regression Street",
        description: "Created to prove admin-published hotels appear publicly.",
        checkInTime: "14:00",
        checkOutTime: "12:00",
      });
      expect(create.status).toBe(201);
      const id = create.body.id;
      const slug = create.body.slug as string;
      // Scoped to this test's own dedicated, published destination, so the result is never at
      // the mercy of how many other hotels a shared test database happens to have accumulated.
      const listingUrl = `${PREFIX}/hotels?destination=${destinationSlug}&pageSize=50`;

      // Still DRAFT: must not appear on the public site at all.
      const beforePublish = await api(t).get(listingUrl);
      expect(beforePublish.body.items.map((h: { id: string }) => h.id)).not.toContain(id);

      // Published, but (like the real "Halton" hotel) no room and no rate plan yet: must still
      // appear on the public listing, with a null price rather than being hidden or erroring.
      await a().patch(`${ADMIN}/hotels/${id}/status`).send({ status: "PUBLISHED" }).expect(200);
      const afterPublish = await api(t).get(listingUrl);
      const listed = (afterPublish.body.items as { id: string; fromPricePerNight: unknown }[]).find((h) => h.id === id);
      expect(listed).toBeDefined();
      expect(listed!.fromPricePerNight).toBeNull();

      const detail = await api(t).get(`${PREFIX}/hotels/${slug}`).expect(200);
      expect(detail.body.fromPricePerNight).toBeNull();

      // Unpublished again: must disappear from the public listing once more.
      await a().patch(`${ADMIN}/hotels/${id}/status`).send({ status: "DRAFT" }).expect(200);
      const afterUnpublish = await api(t).get(listingUrl);
      expect(afterUnpublish.body.items.map((h: { id: string }) => h.id)).not.toContain(id);

      await a().delete(`${ADMIN}/hotels/${id}`).expect(204);
    });

    it("publishes the hotel and room, then deletes the hotel once there are no bookings against it", async () => {
      await a().patch(`${ADMIN}/hotels/${hotelId}/status`).send({ status: "PUBLISHED" }).expect(200);
      await a().patch(`${ADMIN}/hotels/${hotelId}/rooms/${roomId}/status`).send({ status: "PUBLISHED" }).expect(200);

      const res = await a().delete(`${ADMIN}/hotels/${hotelId}`);
      expect(res.status).toBe(204);
    });

    it("refuses to delete a hotel that has a held booking against it", async () => {
      const checkIn = isoDay(5);
      const checkOut = isoDay(6);
      await setRoomFree(t, ids.flexPyramidRate.roomId, checkIn, 5);
      await createPendingBooking(t, hotelQuoteBody(ids.flexPyramidRate.id, { checkIn, checkOut }));

      const room = await t.prisma.room.findUniqueOrThrow({ where: { id: ids.flexPyramidRate.roomId } });
      const res = await a().delete(`${ADMIN}/hotels/${room.hotelId}`);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("HOTEL_HAS_ACTIVE_BOOKINGS");
    });
  });

  describe("Tours", () => {
    let tourId: string;

    it("creates a tour and a session, then enforces the capacity floor", async () => {
      const dest = await a().post(`${ADMIN}/destinations`).send({ slug: `tour-admin-${randomUUID().slice(0, 8)}`, name: "Tour Admin Dest", countryCode: "EG" });
      const created = await a().post(`${ADMIN}/tours`).send({
        slug: `test-tour-${randomUUID().slice(0, 8)}`,
        title: "Test Tour",
        category: "SIGHTSEEING",
        destinationId: dest.body.id,
        meetingPoint: "Lobby",
        durationMinutes: 120,
        maxGroupSize: 10,
        currency: "EGP",
        pricePerPerson: "500.00",
        overview: "A test tour",
        itinerary: [{ offsetMinutes: 0, title: "Start", description: "Begin" }],
        cancellationPolicyId: policyId,
      });
      expect(created.status).toBe(201);
      tourId = created.body.id;

      const session = await a().post(`${ADMIN}/tours/${tourId}/sessions`).send({ startsAt: new Date(Date.now() + 7 * 86400_000).toISOString(), capacity: 10 });
      expect(session.status).toBe(201);
      const sessionId = session.body.id;

      // Reduce capacity to a value still >= held+booked (both 0): allowed.
      const ok = await a().patch(`${ADMIN}/tours/${tourId}/sessions/${sessionId}/capacity`).send({ capacity: 5 });
      expect(ok.status).toBe(200);
      expect(ok.body.capacity).toBe(5);

      const list = await a().get(`${ADMIN}/tour-sessions`).query({ tourId, pageSize: 50 });
      expect(list.status).toBe(200);
      const row = list.body.items.find((s: { id: string }) => s.id === sessionId);
      expect(row).toBeDefined();
      expect(row.tourTitle).toBe("Test Tour");
      expect(row.capacity).toBe(5);
      expect(row.remaining).toBe(5);

      const byTitle = await a().get(`${ADMIN}/tour-sessions`).query({ q: "Test Tour", pageSize: 50 });
      expect(byTitle.body.items.some((s: { id: string }) => s.id === sessionId)).toBe(true);

      const unauth = await api(t).get(`${ADMIN}/tour-sessions`);
      expect(unauth.status).toBe(401);
    });
  });

  describe("Cars", () => {
    it("creates a car model, rejects an unknown cancellation policy, then accepts a real one", async () => {
      const bad = await a().post(`${ADMIN}/cars`).send({
        slug: `test-car-${randomUUID().slice(0, 8)}`,
        brand: "TestBrand",
        name: "Test Model",
        category: "ECONOMY",
        transmission: "AUTOMATIC",
        passengers: 4,
        bags: 2,
        doors: 4,
        includedKmPerDay: 200,
        minDriverAge: 21,
        currency: "EGP",
        pricePerDay: "500.00",
        depositAmount: "1000.00",
        cancellationPolicyId: randomUUID(),
      });
      expect(bad.status).toBe(404);

      const ok = await a().post(`${ADMIN}/cars`).send({
        slug: `test-car-${randomUUID().slice(0, 8)}`,
        brand: "TestBrand",
        name: "Test Model",
        category: "ECONOMY",
        transmission: "AUTOMATIC",
        passengers: 4,
        bags: 2,
        doors: 4,
        includedKmPerDay: 200,
        minDriverAge: 21,
        currency: "EGP",
        pricePerDay: "500.00",
        depositAmount: "1000.00",
        cancellationPolicyId: policyId,
      });
      expect(ok.status).toBe(201);
    });
  });

  describe("Transfers", () => {
    it("creates a vehicle class and rejects a rate with identical origin and destination", async () => {
      const vc = await a().post(`${ADMIN}/transfer-vehicle-classes`).send({ code: "VAN", name: "Test Van", passengersMax: 8, luggageMax: 6 });
      // VAN may already exist from seeding; either a fresh create or a conflict is acceptable here.
      expect([201, 409]).toContain(vc.status);

      const res = await a().post(`${ADMIN}/transfer-rates`).send({
        originLocationId: ids.caiAirport.id,
        destinationLocationId: ids.caiAirport.id,
        vehicleClassId: ids.sedanRoute.vehicleClassId,
        amount: "300.00",
        currency: "EGP",
        durationMinutes: 45,
        validFrom: "2026-01-01",
      });
      expect(res.status).toBe(409);
    });
  });

  describe("Packages", () => {
    it("creates a package and a departure, then enforces the capacity floor", async () => {
      const dest = await a().post(`${ADMIN}/destinations`).send({ slug: `pkg-admin-${randomUUID().slice(0, 8)}`, name: "Package Admin Dest", countryCode: "EG" });
      const created = await a().post(`${ADMIN}/packages`).send({
        slug: `test-package-${randomUUID().slice(0, 8)}`,
        title: "Test Package",
        overview: "A test package",
        durationNights: 3,
        durationDays: 4,
        budgetTier: "MID",
        pricingBasis: "PER_PERSON",
        currency: "EGP",
        basePrice: "3000.00",
        maxTravellers: 6,
        cancellationPolicyId: policyId,
        itinerary: [{ day: 1, title: "Arrival", description: "Welcome" }],
        destinationIds: [dest.body.id],
      });
      expect(created.status).toBe(201);
      const packageId = created.body.id;

      const departure = await a().post(`${ADMIN}/packages/${packageId}/departures`).send({ startsOn: "2027-01-10", capacity: 6 });
      expect(departure.status).toBe(201);

      const reduce = await a().patch(`${ADMIN}/packages/${packageId}/departures/${departure.body.id}/capacity`).send({ capacity: 2 });
      expect(reduce.status).toBe(200);
    });

    it("rejects a package whose minTravellers exceeds maxTravellers", async () => {
      const dest = await a().post(`${ADMIN}/destinations`).send({ slug: `pkg-bad-${randomUUID().slice(0, 8)}`, name: "Bad Dest", countryCode: "EG" });
      const res = await a().post(`${ADMIN}/packages`).send({
        slug: `test-bad-package-${randomUUID().slice(0, 8)}`,
        title: "Bad Package",
        overview: "Invalid",
        durationNights: 2,
        durationDays: 3,
        budgetTier: "BUDGET",
        pricingBasis: "PER_PERSON",
        currency: "EGP",
        basePrice: "1000.00",
        minTravellers: 10,
        maxTravellers: 2,
        cancellationPolicyId: policyId,
        itinerary: [{ day: 1, title: "A", description: "B" }],
        destinationIds: [dest.body.id],
      });
      expect(res.status).toBe(409);
    });
  });

  describe("Locations", () => {
    let destinationId: string;
    let airportId: string;
    let branchId: string;

    beforeAll(async () => {
      const dest = await a().post(`${ADMIN}/destinations`).send({ slug: `location-admin-${randomUUID().slice(0, 8)}`, name: "Location Admin Dest", countryCode: "EG" });
      destinationId = dest.body.id;
    });

    it("rejects an unauthenticated caller", async () => {
      const res = await api(t).get(`${ADMIN}/locations`);
      expect(res.status).toBe(401);
    });

    it("creates an airport and a car branch location", async () => {
      // code is globally unique (it's the IATA code for a real AIRPORT) — randomized so reruns
      // against a database that kept a previous run's row never collide.
      const airport = await a()
        .post(`${ADMIN}/locations`)
        .send({ type: "AIRPORT", code: randomUUID().slice(0, 3).toUpperCase(), name: "E2E Test Airport", destinationId });
      expect(airport.status).toBe(201);
      expect(airport.body.status).toBe("PUBLISHED");
      airportId = airport.body.id;

      const branch = await a().post(`${ADMIN}/locations`).send({ type: "CAR_BRANCH", name: "E2E Test Branch", destinationId });
      expect(branch.status).toBe(201);
      branchId = branch.body.id;
    });

    it("rejects a duplicate code with a clean conflict, not a raw 500", async () => {
      const code = randomUUID().slice(0, 8).toUpperCase();
      const first = await a().post(`${ADMIN}/locations`).send({ type: "ZONE", code, name: "Duplicate attempt", destinationId });
      expect(first.status).toBe(201);
      const second = await a().post(`${ADMIN}/locations`).send({ type: "ZONE", code, name: "Duplicate attempt 2", destinationId });
      expect(second.status).toBe(409);
      expect(second.body.code).toBe("CODE_TAKEN");
    });

    it("filters the list by type — the exact query the car inventory admin UI depends on", async () => {
      const res = await a().get(`${ADMIN}/locations`).query({ type: "CAR_BRANCH", pageSize: 50 });
      expect(res.status).toBe(200);
      const ids = res.body.items.map((l: { id: string }) => l.id);
      expect(ids).toContain(branchId);
      expect(ids).not.toContain(airportId);
    });

    it("rejects an invalid type", async () => {
      const res = await a().get(`${ADMIN}/locations`).query({ type: "NOT_A_TYPE" });
      expect(res.status).toBe(422);
    });

    it("updates a location's name", async () => {
      const res = await a().patch(`${ADMIN}/locations/${branchId}`).send({ name: "Renamed Branch" });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Renamed Branch");
    });

    it("unpublishes and republishes a location", async () => {
      const draft = await a().patch(`${ADMIN}/locations/${branchId}/status`).send({ status: "DRAFT" });
      expect(draft.status).toBe(200);
      expect(draft.body.status).toBe("DRAFT");
      const published = await a().patch(`${ADMIN}/locations/${branchId}/status`).send({ status: "PUBLISHED" });
      expect(published.body.status).toBe("PUBLISHED");
    });

    it("deletes a location not referenced by any rate or inventory", async () => {
      const res = await a().delete(`${ADMIN}/locations/${branchId}`);
      expect(res.status).toBe(204);
      const after = await a().get(`${ADMIN}/locations/${branchId}`);
      expect(after.status).toBe(404);
    });
  });
});
