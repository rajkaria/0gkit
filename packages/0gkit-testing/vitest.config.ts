import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // SP12 polish: turbo's parallel scheduler can starve these suites at the
    // default 5s timeout when CPU is contended. Bumping the per-test budget
    // makes the suite deterministic without serialising the whole monorepo.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/__tests__/**",
        "src/matchers/index.ts",
        "src/mocks/index.ts",
        "src/fixtures/index.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70,
      },
    },
  },
});
