import { spawnSync } from "node:child_process";
import { assertTestDatabase, readEnvFile } from "./load-env.mjs";

// Seeds only the test database. The same guard as the integration runner refuses any non-_test URL.
const env = readEnvFile(".env.test");
assertTestDatabase(env.DATABASE_URL);

const seed = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "seed"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: env.DATABASE_URL },
});
process.exit(seed.status ?? 1);
