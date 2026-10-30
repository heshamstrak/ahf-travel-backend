import * as argon2 from "argon2";


export function hashPassword(password: string): Promise<string> {
  // OWASP minimum for argon2id: 19 MiB memory, 2 iterations, 1 lane.
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    raw: false,
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
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
