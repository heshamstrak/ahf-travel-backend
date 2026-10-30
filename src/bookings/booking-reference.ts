/**
 * Customer-facing booking reference: "EB-" followed by 7 Crockford base32 characters.
 *
 * Built from the booking_reference_seq Postgres sequence (never repeats), then scrambled with a
 * bijective 32-bit multiplicative hash so consecutive bookings do not produce consecutive-looking
 * codes. The scramble is a bijection over 32-bit integers (odd multiplier, so every input maps to a
 * distinct output), which keeps references collision-free without a second, randomness-based
 * generator. It is not a secret: the reference alone is never treated as authorization (callers
 * must also prove ownership or present the booking's email).
 */

// Crockford base32: excludes I, L, O, U to avoid visual confusion.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const MASK_32_BIT = 0xffffffffn;
// Odd, so it is invertible mod 2^32: a bijection on 32-bit integers. (Knuth's multiplicative hash constant.)
const MULTIPLIER = 2654435761n;
const CODE_LENGTH = 7;

export const BOOKING_REFERENCE_PATTERN = /^EB-[0-9A-HJKMNPQRSTVWXYZ]{7}$/;

/**
 * Scrambles a non-negative sequence value into a reference code. Distinct inputs below 2^32 always
 * produce distinct outputs, so uniqueness follows directly from the sequence never repeating.
 */
export function encodeBookingReference(sequenceValue: bigint): string {
  if (sequenceValue < 0n) throw new Error("sequence value must not be negative");
  let value = (sequenceValue * MULTIPLIER) & MASK_32_BIT;
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code = ALPHABET[Number(value & 31n)] + code;
    value >>= 5n;
  }
  return `EB-${code}`;
}
