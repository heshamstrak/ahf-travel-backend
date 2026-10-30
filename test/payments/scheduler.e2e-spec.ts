import { createTestApp, TestApp } from "../support/app";
import { loadCatalogue } from "../catalogue/support";
import { loadConfig } from "../../src/config/env";
import { HoldExpirationService } from "../../src/bookings/hold-expiration.service";
import { HoldExpirationScheduler } from "../../src/bookings/hold-expiration.scheduler";
import { catalogueIds, createPendingBooking, restoreSharedFixtures, selectCash, setTourFree, tourQuoteBody } from "./support";

const PAST = new Date("2020-01-01T00:00:00Z");

describe("Hold expiration scheduler (integration)", () => {
  let t: TestApp;
  let ids: Awaited<ReturnType<typeof catalogueIds>>;

  beforeAll(async () => {
    t = await createTestApp();
    await loadCatalogue(t.prisma);
    ids = await catalogueIds(t.prisma);
  });

  afterAll(async () => {
    // "never expires a CONFIRMED booking" permanently books a seat on pyramidsSession (cash
    // confirmation moves held -> sold, which the expiry test below it never undoes).
    await restoreSharedFixtures(t, ids);
    await t.close();
  });

  /** Two independently-constructed scheduler wrappers, each with their own "already running" flag,
   *  sharing the one real HoldExpirationService and the one real database — the same shape as two
   *  application instances' timers firing at the same moment. */
  function twoSchedulerInstances(): [HoldExpirationScheduler, HoldExpirationScheduler] {
    const service = t.app.get(HoldExpirationService);
    const config = loadConfig();
    return [new HoldExpirationScheduler(service, config), new HoldExpirationScheduler(service, config)];
  }

  it("expires exactly once when two scheduler instances tick over the same overdue booking at once", async () => {
    await setTourFree(t, ids.pyramidsSession.id, 5);
    const booking = await createPendingBooking(t, tourQuoteBody(ids.pyramidsSession.id));
    await t.prisma.booking.update({ where: { id: booking.id }, data: { holdExpiresAt: PAST } });

    const [a, b] = twoSchedulerInstances();
    const [resultA, resultB] = await Promise.all([a.tick(), b.tick()]);
    const expiredTotal = [resultA, resultB]
      .filter((r): r is { scanned: number; expired: number; failed: number } => "expired" in r)
      .reduce((sum, r) => sum + r.expired, 0);
    expect(expiredTotal).toBe(1);

    const updated = await t.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updated.status).toBe("EXPIRED");
  });

  it("never expires a CONFIRMED booking, even once its original hold deadline has long passed", async () => {
    await setTourFree(t, ids.pyramidsSession.id, 5);
    const booking = await createPendingBooking(t, tourQuoteBody(ids.pyramidsSession.id));
    await selectCash(t, booking.id, { email: booking.customer.email }).expect(201);
    const confirmedRow = await t.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(confirmedRow.status).toBe("CONFIRMED");

    // The booking's own original deadline has long passed; a naive query without the status guard
    // would pick it up.
    await t.prisma.booking.update({ where: { id: booking.id }, data: { holdExpiresAt: PAST } });
    const [a] = twoSchedulerInstances();
    await a.tick();

    const after = await t.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).toBe("CONFIRMED"); // untouched: it no longer matches status = PENDING_PAYMENT
    const item = await t.prisma.bookingItem.findFirstOrThrow({ where: { bookingId: booking.id } });
    expect(item.status).toBe("CONFIRMED");
  });

  it("a single scheduler instance skips an overlapping tick rather than running two scans at once", async () => {
    const [a] = twoSchedulerInstances();
    const [first, second] = await Promise.all([a.tick(), a.tick()]);
    const results = [first, second];
    const skipped = results.filter((r) => "skipped" in r);
    const ran = results.filter((r): r is { scanned: number; expired: number; failed: number } => "expired" in r);
    expect(skipped).toHaveLength(1);
    expect(ran).toHaveLength(1);
  });
});
