import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      // index.ts is a re-export barrel; sdk.ts is exercised by the
      // integration path in the template (it lazy-imports optional peers).
      exclude: ["src/index.ts", "src/__tests__/**", "src/sdk.ts"],
      thresholds: { lines: 85, functions: 85, statements: 85, branches: 75 },
    },
  },
});
