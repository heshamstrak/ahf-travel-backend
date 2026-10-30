import { randomBytes } from "node:crypto";
import { argon2id, argon2Verify } from "hash-wasm";

// WASM Argon2id (hash-wasm), not the native `argon2` binding: prebuilt native binaries
// require a glibc newer than some hosting runtimes ship, which crashes the process at
// startup. hash-wasm has no native dependency and produces byte-identical PHC strings
// (verified against node-argon2's output for the same salt/params), so existing hashes
// keep verifying.
export async function hashPassword(password: string): Promise<string> {
  // OWASP minimum for argon2id: 19 MiB memory, 2 iterations, 1 lane.
  return argon2id({
    password,
    salt: randomBytes(16),
    memorySize: 19456,
    iterations: 2,
    parallelism: 1,
    hashLength: 32,
    outputType: "encoded",
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2Verify({ hash, password });
  } catch {
    return false;
  }
}

let dummyHashPromise: Promise<string> | null = null;

/**
 * Runs a real verification for unknown emails so response time does not reveal
 * whether an account exists.
 */
export async function burnPasswordTime(password: string): Promise<void> {
  dummyHashPromise ??= hashPassword("dummy-password-for-timing-only");
  await verifyPassword(await dummyHashPromise, password);
}
