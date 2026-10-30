import { hashRequest } from "./request-hash";

describe("request hash (idempotency comparison)", () => {
  it("is stable for the same logical value regardless of key order", () => {
    const a = hashRequest({ quoteId: "q1", customer: { firstName: "Jane", lastName: "Doe" } });
    const b = hashRequest({ customer: { lastName: "Doe", firstName: "Jane" }, quoteId: "q1" });
    expect(a).toBe(b);
  });

  it("changes when any value changes", () => {
    const a = hashRequest({ quoteId: "q1", adults: 2 });
    const b = hashRequest({ quoteId: "q1", adults: 3 });
    expect(a).not.toBe(b);
  });

  it("treats arrays positionally, not as sets", () => {
    const a = hashRequest({ items: [1, 2] });
    const b = hashRequest({ items: [2, 1] });
    expect(a).not.toBe(b);
  });

  it("produces a stable hex SHA-256 length", () => {
    expect(hashRequest({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("distinguishes null, undefined-as-missing and absent keys consistently", () => {
    const withNull = hashRequest({ a: 1, b: null });
    const withoutB = hashRequest({ a: 1 });
    expect(withNull).not.toBe(withoutB);
  });
});
