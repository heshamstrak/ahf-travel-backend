import { createHash } from "crypto";

/**
 * Deterministic JSON: object keys sorted recursively, so two requests with the same logical
 * content always hash the same, regardless of key order.
 */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const input = value as Record<string, unknown>;
    return Object.keys(input)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeys(input[key]);
        return acc;
      }, {});
  }
  return value;
}

/** SHA-256 of a value's canonical JSON form. Used to detect whether a replayed request really matches. */
export function hashRequest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(sortKeys(value)), "utf8").digest("hex");
}
