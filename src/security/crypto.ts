import { createHash, randomBytes } from "crypto";

/** URL-safe random token with at least 256 bits of entropy. Returned to the client once. */
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Only hashes are stored. A leaked database does not reveal usable tokens. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
