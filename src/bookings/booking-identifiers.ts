import { HttpStatus } from "@nestjs/common";
import { AppError } from "../common/errors";
import { BOOKING_REFERENCE_PATTERN } from "./booking-reference";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type IdOrReference = { kind: "id"; value: string } | { kind: "reference"; value: string };

/** Booking routes accept either the database id or the customer-facing reference. */
export function parseIdOrReference(raw: string, field = "idOrReference"): IdOrReference {
  if (UUID.test(raw)) return { kind: "id", value: raw.toLowerCase() };
  if (BOOKING_REFERENCE_PATTERN.test(raw)) return { kind: "reference", value: raw };
  throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_FAILED", "Some fields are invalid", undefined, [
    { field, message: "must be a UUID or a booking reference (EB-XXXXXXX)" },
  ]);
}
