import { createTestApp, TestApp } from "../support/app";
import { loadCatalogue } from "../catalogue/support";
import {
  ADMIN,
  api,
  asAdmin,
  catalogueIds,
  createAdmin,
  createPendingBooking,
  hotelQuoteBody,
  isoDay,
  PREFIX,
  restoreSharedFixtures,
  setRoomFree,
  signIn,
  tourQuoteBody,
} from "./support";

/**
 * Section 13 is the critical requirement: admin edits to pricing/availability must never let
 * held + sold + blocked exceed total, must never use read-then-write where a guarded atomic
 * update is required, and existing quotes/bookings must be unaffected.
 */
describe("Admin inventory and pricing safety (integration)", () => {
  let t: TestApp;
  let ids: Awaited<ReturnType<typeof catalogueIds>>;
  let adminToken: string;

  beforeAll(async () => {
    t = await createTestApp();
    await loadCatalogue(t.prisma);
    ids = await catalogueIds(t.prisma);
    adminToken = await signIn(t, await createAdmin(t, "inv-admin"));
  });

  afterAll(async () => {
    await restoreSharedFixtures(t, ids);
    await t.close();
  });

  const a = () => asAdmin(t, adminToken);

  it("refuses to lower a room's total below what is already held, and leaves it unchanged", async () => {
    const room = await t.prisma.room.findUniqueOrThrow({ where: { id: ids.flexPyramidRate.roomId } });
    const date = isoDay(40);
    await setRoomFree(t, room.id, date, 5);
    const before = await t.prisma.roomInventory.findUniqueOrThrow({ where: { roomId_date: { roomId: room.id, date: new Date(`${date}T00:00:00Z`) } } });

    await createPendingBooking(t, hotelQuoteBody(ids.flexPyramidRate.id, { checkIn: date, checkOut: isoDay(41) }));
    const held = await t.prisma.roomInventory.findUniqueOrThrow({ where: { roomId_date: { roomId: room.id, date: new Date(`${date}T00:00:00Z`) } } });
    expect(held.heldUnits).toBe(1);

    const res = await a().put(`${ADMIN}/hotels/${room.hotelId}/rooms/${room.id}/inventory`).send({ startDate: date, endDate: date, totalUnits: 0 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("INVENTORY_BELOW_COMMITTED");

    const after = await t.prisma.roomInventory.findUniqueOrThrow({ where: { roomId_date: { roomId: room.id, date: new Date(`${date}T00:00:00Z`) } } });
    expect(after.totalUnits).toBe(before.totalUnits); // untouched by the rejected write
    expect(after.heldUnits).toBe(1);
  });

  it("accepts raising a room's total, all-or-nothing across a date range", async () => {
    const room = await t.prisma.room.findUniqueOrThrow({ where: { id: ids.flexPyramidRate.roomId } });
    const start = isoDay(50);
    const end = isoDay(52);
    const res = await a().put(`${ADMIN}/hotels/${room.hotelId}/rooms/${room.id}/inventory`).send({ startDate: start, endDate: end, totalUnits: 20 });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    for (const row of res.body) expect(row.totalUnits).toBe(20);
  });

  it("two concurrent admin inventory edits on the same room/date: the database serialises them, neither corrupts the counters", async () => {
    const room = await t.prisma.room.findUniqueOrThrow({ where: { id: ids.flexPyramidRate.roomId } });
    const date = isoDay(60);
    const [first, second] = await Promise.all([
      a().put(`${ADMIN}/hotels/${room.hotelId}/rooms/${room.id}/inventory`).send({ startDate: date, endDate: date, totalUnits: 7 }),
      a().put(`${ADMIN}/hotels/${room.hotelId}/rooms/${room.id}/inventory`).send({ startDate: date, endDate: date, totalUnits: 9 }),
    ]);
    expect([first.status, second.status]).toEqual([200, 200]);
    const row = await t.prisma.roomInventory.findUniqueOrThrow({ where: { roomId_date: { roomId: room.id, date: new Date(`${date}T00:00:00Z`) } } });
    expect([7, 9]).toContain(row.totalUnits); // whichever applied last, never a torn/mixed value
  });

  it("refuses to lower a tour session's capacity below seats already held or booked", async () => {
    // A dedicated, admin-created tour: never touches the nileSession/pyramidsSession fixtures
    // other suites read exact remaining capacity from.
    const policyId = (await t.prisma.cancellationPolicy.findFirstOrThrow({})).id;
    const dest = await a().post(`${ADMIN}/destinations`).send({ slug: `inv-dest-${Date.now()}`, name: "Inventory Test Dest", countryCode: "EG" });
    await a().patch(`${ADMIN}/destinations/${dest.body.id}/status`).send({ status: "PUBLISHED" }).expect(200);
    const tour = await a().post(`${ADMIN}/tours`).send({
      slug: `inv-tour-${Date.now()}`,
      title: "Inventory Test Tour",
      category: "SIGHTSEEING",
      destinationId: dest.body.id,
      meetingPoint: "Lobby",
      durationMinutes: 60,
      maxGroupSize: 10,
      currency: "EGP",
      pricePerPerson: "100.00",
      overview: "x",
      itinerary: [{ offsetMinutes: 0, title: "Start", description: "Begin" }],
      cancellationPolicyId: policyId,
    });
    const sessionRes = await a().post(`${ADMIN}/tours/${tour.body.id}/sessions`).send({ startsAt: new Date(Date.now() + 14 * 86400_000).toISOString(), capacity: 10 });
    const sessionId = (sessionRes.body as { id: string }).id;
    const tourId = (tour.body as { id: string }).id;
    await a().patch(`${ADMIN}/tours/${tourId}/status`).send({ status: "PUBLISHED" }).expect(200);

    await createPendingBooking(t, tourQuoteBody(sessionId, { participants: 3 }));
    const held = await t.prisma.tourSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(held.heldUnits).toBe(3);

    const res = await a().patch(`${ADMIN}/tours/${tourId}/sessions/${sessionId}/capacity`).send({ capacity: 2 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("INVENTORY_BELOW_COMMITTED");

    const unchanged = await t.prisma.tourSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(unchanged.capacity).toBe(10);

    const ok = await a().patch(`${ADMIN}/tours/${tourId}/sessions/${sessionId}/capacity`).send({ capacity: 3 });
    expect(ok.status).toBe(200);

    // This tour and destination were published only so the quote/booking pipeline would accept
    // them; unpublish both so this throwaway fixture never leaks into the public catalogue list
    // other suites assert an exact, closed set over (e.g. catalogue/destinations.e2e-spec.ts).
    await a().patch(`${ADMIN}/tours/${tourId}/status`).send({ status: "DRAFT" }).expect(200);
    await a().patch(`${ADMIN}/destinations/${dest.body.id}/status`).send({ status: "DRAFT" }).expect(200);
  });

  it("updating a rate plan's price never alters an already-created booking's stored total", async () => {
    const room = await t.prisma.room.findUniqueOrThrow({ where: { id: ids.flexPyramidRate.roomId } });
    const ratePlanBefore = await t.prisma.ratePlan.findUniqueOrThrow({ where: { id: ids.flexPyramidRate.id } });

    await setRoomFree(t, room.id, isoDay(45), 5);
    const booking = await createPendingBooking(t, hotelQuoteBody(ids.flexPyramidRate.id, { checkIn: isoDay(45), checkOut: isoDay(46) }));
    const totalBefore = booking.totals.total;

    const priceChange = await a()
      .patch(`${ADMIN}/hotels/${room.hotelId}/rooms/${room.id}/rate-plans/${ratePlanBefore.id}`)
      .send({ basePricePerNight: Number(ratePlanBefore.basePricePerNight) + 500 });
    expect(priceChange.status).toBe(200);

    const bookingAfter = await api(t).get(`${PREFIX}/bookings/${booking.id}`).query({ email: booking.customer.email }).expect(200);
    expect(bookingAfter.body.totals.total).toBe(totalBefore);
  });
});
