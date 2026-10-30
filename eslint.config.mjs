import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "scripts"] },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
    },
  },
  {
    // HTTP test bodies are untyped JSON; typing each one adds noise without catching bugs.
    files: ["test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
    },
  },
  {
    files: ["**/*.mjs", "*.mjs"],
    ...tseslint.configs.disableTypeChecked,
  },
);
