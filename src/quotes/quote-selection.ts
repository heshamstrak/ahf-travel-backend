import { z } from "zod";
import { validationFailed, FieldError } from "../common/errors";
import { isValidIsoDate } from "../catalog/common/query";

/**
 * Per-product selections. Every schema is strict, so a client cannot send a price, a total, a tax or
 * any other field the server calculates. Unknown keys are refused, not ignored.
 */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date (YYYY-MM-DD)")
  .refine(isValidIsoDate, "must be a real calendar date");

const uuid = z.uuid("must be a UUID");
const count = (min: number, max: number) => z.number().int().min(min, `must be at least ${min}`).max(max, `must be at most ${max}`);

export const SELECTION_SCHEMAS = {
  HOTEL: z
    .object({
      checkIn: isoDate,
      checkOut: isoDate,
      rooms: count(1, 6).default(1),
      adults: count(1, 12),
      children: count(0, 8).default(0),
    })
    .strict(),
  TOUR: z.object({ participants: count(1, 40) }).strict(),
  CAR: z
    .object({
      pickupDate: isoDate,
      dropoffDate: isoDate,
      pickupLocationId: uuid,
      driverAge: count(18, 99),
    })
    .strict(),
  TRANSFER: z
    .object({
      date: isoDate,
      passengers: count(1, 12),
      luggage: count(0, 12).default(0),
    })
    .strict(),
  PACKAGE: z
    .object({
      adults: count(1, 10),
      children: count(0, 10).default(0),
      rooms: count(1, 10).optional(),
    })
    .strict(),
} as const;

export type ProductKind = keyof typeof SELECTION_SCHEMAS;
export type Selection<K extends ProductKind> = z.infer<(typeof SELECTION_SCHEMAS)[K]>;

/** Validates a selection for its product. Failures become a 422 with one entry per field. */
export function parseSelection<K extends ProductKind>(kind: K, raw: unknown): Selection<K> {
  const result = SELECTION_SCHEMAS[kind].safeParse(raw);
  if (result.success) return result.data as Selection<K>;
  const errors: FieldError[] = result.error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.map(String).join(".") : "selection",
    message: issue.code === "unrecognized_keys" ? `unknown field ${issue.keys.join(", ")}` : issue.message,
  }));
  throw validationFailed(errors);
}
