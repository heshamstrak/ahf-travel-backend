import { spawnSync } from "node:child_process";
import { assertTestDatabase, readEnvFile } from "./load-env.mjs";

// Applies pending migrations to the TEST database. Non-destructive: never resets or drops data.
// Tests clean up their own rows; use a fresh container to start from an empty database.
const env = readEnvFile(".env.test");
assertTestDatabase(env.DATABASE_URL);

const result = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: env.DATABASE_URL },
  },
);
process.exit(result.status ?? 1);
