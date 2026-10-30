import { randomUUID } from "crypto";
import request from "supertest";
import type { App } from "supertest/types";
import { hashPassword } from "../../src/security/password";
import { PrismaService } from "../../src/prisma/prisma.service";
import type { TestApp } from "../support/app";
import { expectProblem, isoDay, PREFIX } from "../catalogue/support";

export { expectProblem, isoDay, PREFIX };

export function api(t: TestApp) {
  return request(t.app.getHttpServer() as App);
}

export const QUOTES = `${PREFIX}/quotes`;

/** A user who can sign in. Email is verified so login succeeds. */
export async function createUser(prisma: PrismaService, label: string): Promise<{ id: string; email: string; password: string }> {
  const password = "correct-horse-battery-staple";
  const email = `${label}-${randomUUID().slice(0, 8)}@example.test`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      firstName: "Test",
      lastName: "User",
      emailVerifiedAt: new Date(),
    },
  });
  return { id: user.id, email, password };
}

export async function signIn(t: TestApp, user: { email: string; password: string }): Promise<string> {
  const res = await api(t).post(`${PREFIX}/auth/login`).send({ email: user.email, password: user.password }).expect(200);
  return res.body.accessToken as string;
}

/**
 * Catalogue identifiers for the seeded products, read from the database. Hidden fixtures are included
 * so that tests can prove they are refused.
 */
export async function catalogueIds(prisma: PrismaService) {
  const today = new Date(`${isoDay(0)}T00:00:00Z`);
  const plan = (room: string, rate: string) =>
    prisma.ratePlan.findFirstOrThrow({ where: { code: rate, room: { code: room } } });
  const session = (slug: string, status: "OPEN" | "CLOSED", future: boolean) =>
    prisma.tourSession.findFirstOrThrow({
      where: { tour: { slug }, status, startsAt: future ? { gte: new Date() } : { lt: new Date() } },
      orderBy: { startsAt: "asc" },
    });
  const departure = (slug: string) =>
    prisma.packageDeparture.findFirstOrThrow({
      where: { package: { slug }, status: "OPEN", startsOn: { gt: today } },
      orderBy: { startsOn: "asc" },
    });
  const location = (name: string) => prisma.location.findFirstOrThrow({ where: { name } });
  const route = (origin: string, destination: string, vehicleCode: string) =>
    prisma.transferRate.findFirstOrThrow({
      where: {
        origin: { code: origin },
        destination: { name: destination },
        vehicleClass: { code: vehicleCode as never },
        validFrom: new Date("2026-01-01"),
      },
    });

  return {
    flexPyramidRate: await plan("mena-pyramid-view-king", "FLEX"),
    nonRefundableTwinRate: await plan("mena-garden-twin", "NRF"),
    hiddenUnsellableRate: await plan("hidden-unsellable-room", "FLEX"),
    hiddenDraftRate: await plan("hidden-draft-room", "FLEX"),
    nileSession: await session("nile-dinner-cruise", "OPEN", true),
    pyramidsSession: await session("pyramids-sphinx-tour", "OPEN", true),
    pastSession: await prisma.tourSession.findFirstOrThrow({ where: { tour: { slug: "nile-dinner-cruise" }, startsAt: { lt: new Date() } } }),
    closedSession: await session("nile-dinner-cruise", "CLOSED", true),
    corollaCar: await prisma.carModel.findFirstOrThrow({ where: { slug: "toyota-corolla" } }),
    cClassCar: await prisma.carModel.findFirstOrThrow({ where: { slug: "mercedes-c-class" } }),
    draftCar: await prisma.carModel.findFirstOrThrow({ where: { slug: "hidden-draft-car" } }),
    caiAirport: await location("Cairo International Airport"),
    zoneCairo: await location("Cairo city centre"),
    archivedBranch: await location("Archived Luxor branch"),
    sedanRoute: await route("CAI", "Cairo city centre", "SEDAN"),
    expiredRoute: await prisma.transferRate.findFirstOrThrow({ where: { validTo: new Date("2024-12-31") } }),
    inactiveRoute: await prisma.transferRate.findFirstOrThrow({ where: { isActive: false } }),
    cairoWeekendDeparture: await departure("cairo-weekend"),
    cairoWeekend: await prisma.package.findFirstOrThrow({ where: { slug: "cairo-weekend" } }),
    pastDeparture: await prisma.packageDeparture.findFirstOrThrow({ where: { startsOn: new Date("2025-06-01") } }),
  };
}

/** Restores a database value after a test changed it, even when the test fails. */
export async function restoreAfter<T>(change: () => Promise<void>, restore: () => Promise<void>, body: () => Promise<T>): Promise<T> {
  await change();
  try {
    return await body();
  } finally {
    await restore();
  }
}
