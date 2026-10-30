import { createTestApp, TestApp } from "../support/app";
import { loadCatalogue } from "../catalogue/support";
import {
  api,
  BOOKINGS,
  carQuoteBody,
  catalogueIds,
  createPendingBooking,
  hotelQuoteBody,
  isoDay,
  packageQuoteBody,
  QUOTES,
  restoreSharedFixtures,
  selectCash,
  setCarFree,
  setDepartureFree,
  setRoomFree,
  setTourFree,
  setTransferFree,
  signIn,
  createUser,
  tourQuoteBody,
  transferQuoteBody,
} from "./support";

describe("Cash payment selection (integration)", () => {
  let t: TestApp;
  let ids: Awaited<ReturnType<typeof catalogueIds>>;

  beforeAll(async () => {
    t = await createTestApp();
    await loadCatalogue(t.prisma);
    ids = await catalogueIds(t.prisma);
  });

  afterAll(async () => {
    // nileSession and cairoWeekendDeparture are shared with other suites (see bookings/support.ts).
    await restoreSharedFixtures(t, ids);
    await t.close();
  });

  it("confirms a HOTEL booking: booking CONFIRMED, room held -> sold, payment PENDING (cash not yet collected)", async () => {
    const checkIn = isoDay(10);
    const checkOut = isoDay(12); // 2 nights
    await setRoomFree(t, ids.flexPyramidRate.roomId, checkIn, 5);
    await setRoomFree(t, ids.flexPyramidRate.roomId, isoDay(11), 5);
    const booking = await createPendingBooking(t, hotelQuoteBody(ids.flexPyramidRate.id, { checkIn, checkOut }));

    const res = await selectCash(t, booking.id, { email: booking.customer.email }).expect(201);
    expect(res.body[0]).toMatchObject({ method: "CASH", status: "PENDING" });

    const updated = await api(t).get(`${BOOKINGS}/${booking.id}`).query({ email: booking.customer.email }).expect(200);
    expect(updated.body.status).toBe("CONFIRMED");
    expect(updated.body.paymentStatus).toBe("PAY_LATER");
    expect(updated.body.items[0].status).toBe("CONFIRMED");

    for (const night of [checkIn, isoDay(11)]) {
      const row = await t.prisma.roomInventory.findUniqueOrThrow({
        where: { roomId_date: { roomId: ids.flexPyramidRate.roomId, date: new Date(`${night}T00:00:00Z`) } },
      });
      expect(row.heldUnits).toBe(0);
      expect(row.soldUnits).toBe(1);
    }

    const payment = await t.prisma.payment.findFirstOrThrow({ where: { bookingId: booking.id } });
    expect(payment.method).toBe("CASH");
    expect(payment.status).toBe("PENDING"); // never PAID just because the booking is confirmed
    expect(payment.succeededAt).toBeNull();
  });

  it("confirms a TOUR booking: session held -> booked", async () => {
    await setTourFree(t, ids.nileSession.id, 5);
    const booking = await createPendingBooking(t, tourQuoteBody(ids.nileSession.id));
    await selectCash(t, booking.id, { email: booking.customer.email }).expect(201);

    const session = await t.prisma.tourSession.findUniqueOrThrow({ where: { id: ids.nileSession.id } });
    expect(session.heldUnits).toBe(0);

    const item = await t.prisma.bookingItem.findFirstOrThrow({ where: { bookingId: booking.id } });
    expect(item.status).toBe("CONFIRMED");
  });

  it("confirms a CAR booking: every rental day held -> booked", async () => {
    const pickupDate = isoDay(13);
    const dropoffDate = isoDay(15); // 2 rental days
    await setCarFree(t, ids.corollaCar.id, ids.caiAirport.id, pickupDate, 3);
    await setCarFree(t, ids.corollaCar.id, ids.caiAirport.id, isoDay(14), 3);
    const booking = await createPendingBooking(t, carQuoteBody(ids.corollaCar.id, ids.caiAirport.id, { pickupDate, dropoffDate }));
    await selectCash(t, booking.id, { email: booking.customer.email }).expect(201);

    for (const day of [pickupDate, isoDay(14)]) {
      const row = await t.prisma.carInventory.findUniqueOrThrow({
        where: { carModelId_locationId_date: { carModelId: ids.corollaCar.id, locationId: ids.caiAirport.id, date: new Date(`${day}T00:00:00Z`) } },
      });
      expect(row.heldUnits).toBe(0);
      expect(row.bookedUnits).toBeGreaterThanOrEqual(1);
    }
  });

  it("confirms a TRANSFER booking: capacity held -> booked", async () => {
    const date = isoDay(16);
    await setTransferFree(t, ids.sedanRoute.vehicleClassId, date, 3);
    const booking = await createPendingBooking(t, transferQuoteBody(ids.sedanRoute.id, { date }));
    await selectCash(t, booking.id, { email: booking.customer.email }).expect(201);

    const row = await t.prisma.transferCapacity.findUniqueOrThrow({
      where: { vehicleClassId_date: { vehicleClassId: ids.sedanRoute.vehicleClassId, date: new Date(`${date}T00:00:00Z`) } },
    });
    expect(row.heldUnits).toBe(0);
  });

  it("confirms a PACKAGE booking: departure held -> booked", async () => {
    await setDepartureFree(t, ids.cairoWeekendDeparture.id, 5);
    const booking = await createPendingBooking(t, packageQuoteBody(ids.cairoWeekendDeparture.id, { adults: 1 }));
    await selectCash(t, booking.id, { email: booking.customer.email }).expect(201);

    const row = await t.prisma.packageDeparture.findUniqueOrThrow({ where: { id: ids.cairoWeekendDeparture.id } });
    expect(row.heldTravellers).toBe(0);
  });

  it("rejects selecting cash for someone else's booking (guest, wrong email)", async () => {
    await setTourFree(t, ids.pyramidsSession.id, 5);
    const booking = await createPendingBooking(t, tourQuoteBody(ids.pyramidsSession.id));
    await selectCash(t, booking.id, { email: "someone-else@example.test" }).expect(404);
  });

  it("rejects selecting cash for a booking that is no longer awaiting payment", async () => {
    await setTourFree(t, ids.pyramidsSession.id, 5);
    const booking = await createPendingBooking(t, tourQuoteBody(ids.pyramidsSession.id));
    await selectCash(t, booking.id, { email: booking.customer.email }).expect(201);
    const res = await selectCash(t, booking.id, { email: booking.customer.email });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("BOOKING_NOT_PAYABLE");
  });

  it("lets a signed-in owner select cash without supplying an email", async () => {
    const user = await createUser(t.prisma, "cash-owner");
    const token = await signIn(t, user);
    await setTourFree(t, ids.pyramidsSession.id, 5);
    const quoteRes = await api(t)
      .post(QUOTES)
      .set("Authorization", `Bearer ${token}`)
      .send(tourQuoteBody(ids.pyramidsSession.id))
      .expect(201);
    const quoteId = (quoteRes.body as { id: string }).id;
    const created = await api(t)
      .post(BOOKINGS)
      .set("Idempotency-Key", `cash-owner-${Date.now()}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ quoteId, customer: { firstName: "Jane", lastName: "Doe", email: user.email, phone: "+201234567890", countryCode: "EG" } })
      .expect(201);
    const bookingId = (created.body as { id: string }).id;

    const res = await selectCash(t, bookingId, {}, token);
    expect(res.status).toBe(201);
  });
});
