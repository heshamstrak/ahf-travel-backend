import { generateOpaqueToken, hashToken } from "./crypto";

describe("opaque tokens", () => {
  it("generates url-safe tokens of at least 256 bits", () => {
    const token = generateOpaqueToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, "base64url").length).toBe(32);
  });

  it("does not repeat across calls", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateOpaqueToken()));
    expect(tokens.size).toBe(200);
  });

  it("hashes deterministically to 64 hex characters and never equals the input", () => {
    const token = generateOpaqueToken();
    const hash = hashToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hash);
    expect(hash).not.toContain(token);
  });
});
