import request from "supertest";
import type { App } from "supertest/types";
import { seedCatalogue } from "../../prisma/seed/catalogue";
import { addDays, businessDate } from "../../src/common/business-date";
import { PrismaService } from "../../src/prisma/prisma.service";
import type { TestApp } from "../support/app";

export const PREFIX = "/api/v1";

export function api(t: TestApp) {
  return request(t.app.getHttpServer() as App);
}

/** Loads the development catalogue into the test database. Idempotent, so every suite can call it. */
export function loadCatalogue(prisma: PrismaService) {
  return seedCatalogue(prisma);
}

/** Business date (Africa/Cairo, YYYY-MM-DD) relative to today. Tests never hard-code the clock. */
export function isoDay(offsetDays = 0): string {
  return addDays(businessDate(new Date()), offsetDays);
}

/** UTC calendar date of the earliest open, not-yet-started session of a tour. */
export async function nextTourSessionDay(prisma: PrismaService, tourSlug: string): Promise<string> {
  const session = await prisma.tourSession.findFirst({
    where: { tour: { slug: tourSlug }, status: "OPEN", startsAt: { gte: new Date() } },
    orderBy: { startsAt: "asc" },
  });
  if (!session) throw new Error(`no future session for ${tourSlug}`);
  return session.startsAt.toISOString().slice(0, 10);
}

/** Calendar date of the earliest open, future departure of a package. */
export async function nextDepartureDay(prisma: PrismaService, packageSlug: string): Promise<string> {
  const today = new Date(`${isoDay(0)}T00:00:00Z`);
  const departure = await prisma.packageDeparture.findFirst({
    where: { package: { slug: packageSlug }, status: "OPEN", startsOn: { gte: today } },
    orderBy: { startsOn: "asc" },
  });
  if (!departure) throw new Error(`no future departure for ${packageSlug}`);
  return departure.startsOn.toISOString().slice(0, 10);
}

/** Every property name in a JSON value, at any depth. */
export function allKeys(value: unknown, keys: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) allKeys(item, keys);
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      allKeys(child, keys);
    }
  }
  return keys;
}

/** Field names that must never reach a public response. */
export const INTERNAL_KEYS = [
  "passwordHash",
  "createdById",
  "updatedById",
  "uploadedById",
  "storageKey",
  "variants",
  "ownerId",
  "ownerType",
  "deletedAt",
  "version",
  "status",
  "heldUnits",
  "bookedUnits",
  "blockedUnits",
  "totalUnits",
  "capacity",
  "cancellationPolicyId",
  "sourceUrl",
  "requestId",
  "destinationId",
  "hotelId",
  "roomId",
  "vehicleClassId",
  "originLocationId",
  "destinationLocationId",
  "email",
  "isActive",
  "validFrom",
  "validTo",
  "fromPriceAmount",
  "fromPriceCurrency",
  "updatedAt",
  "createdAt",
];

/** The only keys a public image may carry. */
export const PUBLIC_IMAGE_KEYS = ["url", "altText", "width", "height", "attribution", "license", "isCover"];

/** Asserts an RFC 9457 problem response with a stable code. */
export function expectProblem(response: unknown, status: number, code: string) {
  const res = response as { status: number; headers: Record<string, string>; body: unknown };
  expect(res.status).toBe(status);
  expect(res.headers["content-type"]).toMatch(/application\/problem\+json/);
  expect(res.body).toMatchObject({ status, code, title: expect.any(String) });
}

/** Sorted property names of a response object. */
export function keysOf(value: unknown): string[] {
  return Object.keys(value as object).sort();
}

/** Reads a list of objects from a response body whose shape the test already knows. */
export function itemsAs<T>(items: unknown): T[] {
  return items as T[];
}
