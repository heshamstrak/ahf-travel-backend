import { spawnSync } from "node:child_process";
import { assertTestDatabase, readEnvFile } from "./load-env.mjs";

const env = readEnvFile(".env.test");
assertTestDatabase(env.DATABASE_URL);

const migrate = spawnSync(process.execPath, ["scripts/migrate-test.mjs"], { stdio: "inherit" });
if (migrate.status !== 0) process.exit(migrate.status ?? 1);

// Test process reads .env.test; every integration spec uses the test database.
const jest = spawnSync(
  process.execPath,
  [
    `--env-file=.env.test`,
    "node_modules/jest/bin/jest.js",
    "--selectProjects",
    "integration",
    "--runInBand",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);
process.exit(jest.status ?? 1);
