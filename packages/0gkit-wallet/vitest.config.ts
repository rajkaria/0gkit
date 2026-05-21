import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/types.ts", "src/__tests__/**"],
      thresholds: { lines: 85, functions: 85, statements: 85, branches: 80 },
    },
  },
});
