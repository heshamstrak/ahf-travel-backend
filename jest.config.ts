import type { Config } from "jest";

const shared: Partial<Config> = {
  moduleFileExtensions: ["js", "json", "ts"],
  transform: { "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json", diagnostics: true }] },
  testEnvironment: "node",
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
};

const config: Config = {
  testTimeout: 30000,
  projects: [
    {
      ...shared,
      displayName: "unit",
      rootDir: "src",
      testRegex: ".*\\.spec\\.ts$",
    },
    {
      ...shared,
      displayName: "integration",
      rootDir: "test",
      testRegex: ".*\\.e2e-spec\\.ts$",
      moduleNameMapper: { "^@/(.*)$": "<rootDir>/../src/$1" },
    },
  ],
};

export default config;
