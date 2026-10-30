import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { createTestApp, TestApp } from "./support/app";

/*
 * Database-enforced rules: CHECK constraints and the append-only audit trigger.
 * These protect inventory and money even if application code has a bug.
 *
 * Every check runs inside a transaction that is always rolled back, so the shared test database
 * keeps no fixture rows. Append-only audit rows cannot be deleted, which is why rollback is used.
 */
describe("Database invariants (real PostgreSQL)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  class Rollback extends Error {}

  /** Runs the body in a transaction and always rolls it back. */
  async function rolledBack(body: (tx: Prisma.TransactionClient) => Promise<void>): Promise<void> {
    await t.prisma
      .$transaction(async (tx) => {
        await body(tx);
        throw new Rollback("rollback fixtures");
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });
  }

  const u = () => randomUUID().slice(0, 8);

  async function hotelWithRoom(tx: Prisma.TransactionClient) {
    const destination = await tx.destination.create({
      data: { slug: `dest-${u()}`, name: "Cairo", countryCode: "EG" },
    });
    const hotel = await tx.hotel.create({
      data: {
        slug: `hotel-${u()}`,
        name: "Test Hotel",
        destinationId: destination.id,
        propertyType: "HOTEL",
        starRating: 5,
        addressLine: "1 Nile Corniche",
        description: "Test",
        checkInTime: "14:00",
        checkOutTime: "12:00",
      },
    });
    const room = await tx.room.create({
      data: { hotelId: hotel.id, code: "KING", name: "King", bedType: "King", baseOccupancy: 2, maxAdults: 2, maxChildren: 0 },
    });
    return { hotel, room };
  }

  describe("inventory counters", () => {
    it("accepts a consistent counter row", async () => {
      await rolledBack(async (tx) => {
        const { room } = await hotelWithRoom(tx);
        await expect(
          tx.roomInventory.create({ data: { roomId: room.id, date: new Date("2026-12-01"), totalUnits: 2, heldUnits: 1, soldUnits: 1 } }),
        ).resolves.toBeDefined();
      });
    });

    it("rejects held + sold + blocked above total (cannot oversell)", async () => {
      await rolledBack(async (tx) => {
        const { room } = await hotelWithRoom(tx);
        await expect(
          tx.roomInventory.create({ data: { roomId: room.id, date: new Date("2026-12-02"), totalUnits: 2, heldUnits: 1, soldUnits: 2 } }),
        ).rejects.toThrow(/violates check constraint/);
      });
    });

    it("rejects negative counters", async () => {
      await rolledBack(async (tx) => {
        const { room } = await hotelWithRoom(tx);
        await expect(
          tx.roomInventory.create({ data: { roomId: room.id, date: new Date("2026-12-03"), totalUnits: 2, heldUnits: -1 } }),
        ).rejects.toThrow(/violates check constraint/);
      });
    });

    it("rejects a tour session booked beyond capacity", async () => {
      await rolledBack(async (tx) => {
        const policy = await tx.cancellationPolicy.create({
          data: { code: `p-${u()}`, name: "Flexible", description: "Free", rules: [] },
        });
        const destination = await tx.destination.create({ data: { slug: `dest-${u()}`, name: "Luxor", countryCode: "EG" } });
        const tour = await tx.tour.create({
          data: {
            slug: `tour-${u()}`,
            title: "Valley",
            category: "HISTORY_CULTURE",
            destinationId: destination.id,
            meetingPoint: "Hotel lobby",
            durationMinutes: 600,
            maxGroupSize: 10,
            currency: "EGP",
            pricePerPerson: 1450,
            overview: "x",
            itinerary: [],
            cancellationPolicyId: policy.id,
          },
        });
        await expect(
          tx.tourSession.create({
            data: { tourId: tour.id, startsAt: new Date("2026-12-10T08:00:00Z"), capacity: 4, bookedUnits: 3, heldUnits: 2 },
          }),
        ).rejects.toThrow(/violates check constraint/);
      });
    });
  });

  describe("money arithmetic", () => {
    it("rejects a pricing rule with neither a percent nor a flat amount", async () => {
      await rolledBack(async (tx) => {
        await expect(
          tx.pricingRule.create({
            data: { code: `bad-${u()}`, kind: "TAX", label: "No amount", validFrom: new Date("2026-01-01") },
          }),
        ).rejects.toThrow(/violates check constraint/);
      });
    });

    it("accepts a configurable VAT rule with its rate as data", async () => {
      await rolledBack(async (tx) => {
        const rule = await tx.pricingRule.create({
          data: { code: `vat-${u()}`, kind: "TAX", label: "VAT", percent: 0.14, validFrom: new Date("2026-01-01") },
        });
        expect(rule.percent?.toString()).toBe("0.14");
      });
    });
  });

  describe("audit log is append-only", () => {
    it("rejects updates, deletes and truncation", async () => {
      await rolledBack(async (tx) => {
        const event = await tx.auditEvent.create({
          data: { actorType: "SYSTEM", action: "test.event", aggregateType: "Test", aggregateId: u() },
        });
        await expect(tx.$executeRawUnsafe(`UPDATE "AuditEvent" SET action = 'tampered' WHERE id = ${event.id}`)).rejects.toThrow(/append-only/);
      });
      await rolledBack(async (tx) => {
        const event = await tx.auditEvent.create({
          data: { actorType: "SYSTEM", action: "test.event", aggregateType: "Test", aggregateId: u() },
        });
        await expect(tx.$executeRawUnsafe(`DELETE FROM "AuditEvent" WHERE id = ${event.id}`)).rejects.toThrow(/append-only/);
      });
      await rolledBack(async (tx) => {
        await expect(tx.$executeRawUnsafe(`TRUNCATE "AuditEvent"`)).rejects.toThrow(/append-only/);
      });
    });
  });
});
