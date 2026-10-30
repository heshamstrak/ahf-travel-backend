import { AppError } from "../../common/errors";
import { HttpStatus } from "@nestjs/common";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type IdOrSlug = { kind: "id"; value: string } | { kind: "slug"; value: string };

/**
 * Public routes accept either a UUID or a slug in the same path segment.
 * Anything else is a malformed request (422), not a missing resource (404).
 */
export function parseIdOrSlug(raw: string, field = "idOrSlug"): IdOrSlug {
  if (UUID.test(raw)) return { kind: "id", value: raw.toLowerCase() };
  if (SLUG.test(raw) && raw.length <= 120) return { kind: "slug", value: raw };
  throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_FAILED", "Some fields are invalid", undefined, [
    { field, message: "must be a UUID or a lowercase slug" },
  ]);
}

/** Prisma where-clause for a parsed identifier. */
export function idOrSlugWhere(key: IdOrSlug): { id: string } | { slug: string } {
  return key.kind === "id" ? { id: key.value } : { slug: key.value };
}
