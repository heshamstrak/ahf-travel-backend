import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Reads KEY=VALUE pairs from an env file without touching process.env. */
export function readEnvFile(file) {
  const path = resolve(process.cwd(), file);
  const values = {};
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    values[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return values;
}

/** Refuses any database URL that does not name a test database. Protects dev and production data. */
export function assertTestDatabase(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }
  const dbName = parsed.pathname.replace(/^\//, "");
  if (!/_test$/.test(dbName)) {
    throw new Error(`Refusing to reset database "${dbName}": integration tests only run against a database whose name ends in _test`);
  }
}
