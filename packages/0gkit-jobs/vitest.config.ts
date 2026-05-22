import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/__tests__/**", "src/backends/redis.ts"],
      thresholds: { lines: 85, functions: 85, statements: 85, branches: 75 },
    },
  },
});
