import { BOOKING_REFERENCE_PATTERN, encodeBookingReference } from "./booking-reference";

describe("booking reference encoding", () => {
  it("produces the documented shape", () => {
    expect(encodeBookingReference(100000n)).toMatch(BOOKING_REFERENCE_PATTERN);
    expect(encodeBookingReference(0n)).toMatch(BOOKING_REFERENCE_PATTERN);
  });

  it("is deterministic: the same sequence value always encodes the same way", () => {
    expect(encodeBookingReference(123456n)).toBe(encodeBookingReference(123456n));
  });

  it("never collides across a large run of consecutive sequence values", () => {
    const seen = new Set<string>();
    for (let i = 100000n; i < 150000n; i++) {
      const code = encodeBookingReference(i);
      expect(seen.has(code)).toBe(false);
      seen.add(code);
    }
    expect(seen.size).toBe(50000);
  });

  it("does not read as a sequential counter", () => {
    const codes = Array.from({ length: 20 }, (_, i) => encodeBookingReference(BigInt(100000 + i)));
    const sorted = [...codes].sort();
    // If references were still in sequence order, sorting them would not change the order at all.
    expect(sorted).not.toEqual(codes);
  });

  it("rejects a negative sequence value", () => {
    expect(() => encodeBookingReference(-1n)).toThrow();
  });
});
