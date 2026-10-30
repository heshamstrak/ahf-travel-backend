import { burnPasswordTime, hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("produces an argon2id PHC string, never the plaintext", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).not.toContain("correct horse");
  });

  it("verifies the right password and rejects others", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword(hash, "correct horse battery")).toBe(true);
    expect(await verifyPassword(hash, "correct horse batter")).toBe(false);
  });

  it("uses a fresh salt for identical passwords", async () => {
    const a = await hashPassword("same-password-1");
    const b = await hashPassword("same-password-1");
    expect(a).not.toBe(b);
  });

  it("returns false instead of throwing for a corrupt hash", async () => {
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
  });

  it("burnPasswordTime resolves without revealing anything", async () => {
    await expect(burnPasswordTime("whatever")).resolves.toBeUndefined();
  });
});
