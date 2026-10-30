import { createTestApp, TestApp } from "../support/app";
import { loadCatalogue } from "../catalogue/support";
import { hashPassword } from "../../src/security/password";
import { ADMIN, asAdmin, catalogueIds, createAdmin, hotelQuoteBody, isoDay, setRoomFree, signIn, createPendingBooking } from "./support";

describe("Admin booking management (integration)", () => {
  let t: TestApp;
  let ids: Awaited<ReturnType<typeof catalogueIds>>;
  let adminToken: string;

  beforeAll(async () => {
    t = await createTestApp();
    await loadCatalogue(t.prisma);
    ids = await catalogueIds(t.prisma);
    adminToken = await signIn(t, await createAdmin(t, "booking-admin"));
  });

  afterAll(async () => {
    await t.close();
  });

  const a = () => asAdmin(t, adminToken);

  it("lists bookings with pagination and can filter by status", async () => {
    await setRoomFree(t, ids.flexPyramidRate.roomId, isoDay(10), 5);
    await createPendingBooking(t, hotelQuoteBody(ids.flexPyramidRate.id, { checkIn: isoDay(10), checkOut: isoDay(11) }));

    const res = await a().get(`${ADMIN}/bookings`).query({ status: "PENDING_PAYMENT", pageSize: 5 });
    expect(res.status).toBe(200);
    expect(res.body.meta.pageSize).toBe(5);
    expect(res.body.items.every((b: { status: string }) => b.status === "PENDING_PAYMENT")).toBe(true);
  });

  it("searches by booking reference", async () => {
    await setRoomFree(t, ids.flexPyramidRate.roomId, isoDay(12), 5);
    const booking = await createPendingBooking(t, hotelQuoteBody(ids.flexPyramidRate.id, { checkIn: isoDay(12), checkOut: isoDay(13) }));

    const res = await a().get(`${ADMIN}/bookings`).query({ reference: booking.reference });
    expect(res.status).toBe(200);
    expect(res.body.items.some((b: { reference: string }) => b.reference === booking.reference)).toBe(true);
  });

  it("filters by product type", async () => {
    const res = await a().get(`${ADMIN}/bookings`).query({ productType: "HOTEL", pageSize: 50 });
    expect(res.status).toBe(200);
    expect(res.body.items.every((b: { productTypes: string[] }) => b.productTypes.includes("HOTEL"))).toBe(true);
  });

  it("returns full booking detail, including items, payments and audit history", async () => {
    await setRoomFree(t, ids.flexPyramidRate.roomId, isoDay(14), 5);
    const booking = await createPendingBooking(t, hotelQuoteBody(ids.flexPyramidRate.id, { checkIn: isoDay(14), checkOut: isoDay(15) }));

    const res = await a().get(`${ADMIN}/bookings/${booking.id}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.customer.email).toBe(booking.customer.email);
    expect(res.body.history.some((h: { action: string }) => h.action === "booking.created")).toBe(true);
  });

  it("returns 404 for an unknown booking id, not a 500", async () => {
    const res = await a().get(`${ADMIN}/bookings/00000000-0000-0000-0000-000000000000`);
    expect(res.status).toBe(404);
  });

  it("lets an admin cancel a booking it does not personally own, via the guarded service, auditing it as an ADMIN actor", async () => {
    await setRoomFree(t, ids.flexPyramidRate.roomId, isoDay(16), 5);
    const booking = await createPendingBooking(t, hotelQuoteBody(ids.flexPyramidRate.id, { checkIn: isoDay(16), checkOut: isoDay(17) }));

    const res = await a().post(`${ADMIN}/bookings/${booking.id}/cancel`).send({ reason: "Customer requested by phone" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("CANCELLED");

    const row = await t.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(row.cancelledByType).toBe("ADMIN");

    const events = await t.prisma.auditEvent.findMany({ where: { aggregateType: "Booking", aggregateId: booking.id, action: "booking.cancelled" } });
    expect(events[0]!.actorType).toBe("ADMIN");

    const inventory = await t.prisma.roomInventory.findUniqueOrThrow({ where: { roomId_date: { roomId: ids.flexPyramidRate.roomId, date: new Date(`${isoDay(16)}T00:00:00Z`) } } });
    expect(inventory.heldUnits).toBe(0); // released through the same guarded path as a customer cancel
  });

  it("rejects cancelling a booking that is no longer cancellable", async () => {
    await setRoomFree(t, ids.flexPyramidRate.roomId, isoDay(18), 5);
    const booking = await createPendingBooking(t, hotelQuoteBody(ids.flexPyramidRate.id, { checkIn: isoDay(18), checkOut: isoDay(19) }));
    await a().post(`${ADMIN}/bookings/${booking.id}/cancel`).send({}).expect(201);

    const res = await a().post(`${ADMIN}/bookings/${booking.id}/cancel`).send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("BOOKING_NOT_CANCELLABLE");
  });

  it("lets a FINANCE-role account read bookings but rejects it from cancelling one", async () => {
    const email = `finance-${Date.now()}@example.test`;
    await t.prisma.user.create({
      data: { email, passwordHash: await hashPassword("correct-horse-battery-staple"), firstName: "F", lastName: "U", role: "FINANCE", emailVerifiedAt: new Date() },
    });
    const financeToken = await signIn(t, { email, password: "correct-horse-battery-staple" });

    const list = await asAdmin(t, financeToken).get(`${ADMIN}/bookings`);
    expect(list.status).toBe(200);

    await setRoomFree(t, ids.flexPyramidRate.roomId, isoDay(20), 5);
    const booking = await createPendingBooking(t, hotelQuoteBody(ids.flexPyramidRate.id, { checkIn: isoDay(20), checkOut: isoDay(21) }));
    const cancel = await asAdmin(t, financeToken).post(`${ADMIN}/bookings/${booking.id}/cancel`).send({});
    expect(cancel.status).toBe(403);
  });
});
