import { createTestApp, TestApp } from "../support/app";
import { loadCatalogue } from "../catalogue/support";
import { api, BOOKINGS, bookingBody, catalogueIds, createQuote, createUser, hotelQuoteBody, isoDay, newIdempotencyKey, setRoomFree, signIn } from "./support";

describe("GET /bookings/mine (Milestone 7 addition, integration)", () => {
  let t: TestApp;
  let ids: Awaited<ReturnType<typeof catalogueIds>>;

  beforeAll(async () => {
    t = await createTestApp();
    await loadCatalogue(t.prisma);
    ids = await catalogueIds(t.prisma);
  });

  afterAll(async () => {
    await t.close();
  });

  it("rejects an unauthenticated request", async () => {
    const res = await api(t).get(`${BOOKINGS}/mine`);
    expect(res.status).toBe(401);
  });

  it("lists only the signed-in user's own bookings, never another user's or a guest's", async () => {
    const owner = await createUser(t.prisma, "mine-owner");
    const ownerToken = await signIn(t, owner);
    const other = await createUser(t.prisma, "mine-other");
    const otherToken = await signIn(t, other);

    const checkIn = isoDay(35);
    const checkOut = isoDay(36);
    await setRoomFree(t, ids.flexPyramidRate.roomId, checkIn, 5);

    // One booking as the owner (signed in).
    const ownerQuote = await createQuote(t, hotelQuoteBody(ids.flexPyramidRate.id, { checkIn, checkOut }), ownerToken);
    const ownerBooking = await api(t)
      .post(BOOKINGS)
      .set("Idempotency-Key", newIdempotencyKey())
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(bookingBody(ownerQuote.id))
      .expect(201);

    // One booking as a different signed-in user.
    await setRoomFree(t, ids.flexPyramidRate.roomId, isoDay(37), 5);
    const otherQuote = await createQuote(t, hotelQuoteBody(ids.flexPyramidRate.id, { checkIn: isoDay(37), checkOut: isoDay(38) }), otherToken);
    await api(t).post(BOOKINGS).set("Idempotency-Key", newIdempotencyKey()).set("Authorization", `Bearer ${otherToken}`).send(bookingBody(otherQuote.id)).expect(201);

    // One guest booking (no userId at all) against the same room.
    await setRoomFree(t, ids.flexPyramidRate.roomId, isoDay(39), 5);
    const guestQuote = await createQuote(t, hotelQuoteBody(ids.flexPyramidRate.id, { checkIn: isoDay(39), checkOut: isoDay(40) }));
    await api(t).post(BOOKINGS).set("Idempotency-Key", newIdempotencyKey()).send(bookingBody(guestQuote.id)).expect(201);

    const res = await api(t).get(`${BOOKINGS}/mine`).set("Authorization", `Bearer ${ownerToken}`).expect(200);
    expect(res.body.items.map((b: { id: string }) => b.id)).toEqual([ownerBooking.body.id]);
  });

  it("paginates and filters by status", async () => {
    const user = await createUser(t.prisma, "mine-paged");
    const token = await signIn(t, user);
    for (const offset of [41, 43]) {
      await setRoomFree(t, ids.flexPyramidRate.roomId, isoDay(offset), 5);
      const quote = await createQuote(t, hotelQuoteBody(ids.flexPyramidRate.id, { checkIn: isoDay(offset), checkOut: isoDay(offset + 1) }), token);
      await api(t).post(BOOKINGS).set("Idempotency-Key", newIdempotencyKey()).set("Authorization", `Bearer ${token}`).send(bookingBody(quote.id)).expect(201);
    }

    const page1 = await api(t).get(`${BOOKINGS}/mine`).query({ pageSize: 1, page: 1 }).set("Authorization", `Bearer ${token}`).expect(200);
    expect(page1.body.items).toHaveLength(1);
    expect(page1.body.meta.total).toBe(2);

    const confirmedOnly = await api(t).get(`${BOOKINGS}/mine`).query({ status: "CONFIRMED" }).set("Authorization", `Bearer ${token}`).expect(200);
    expect(confirmedOnly.body.items).toHaveLength(0); // neither booking has been confirmed yet

    const pending = await api(t).get(`${BOOKINGS}/mine`).query({ status: "PENDING_PAYMENT" }).set("Authorization", `Bearer ${token}`).expect(200);
    expect(pending.body.items).toHaveLength(2);
  });
});
