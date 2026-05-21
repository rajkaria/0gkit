import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "jsdom",
    environmentMatchGlobs: [["src/__tests__/boundary.test.ts", "node"]],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/index.ts", "src/__tests__/**"],
      thresholds: { lines: 85, functions: 85, statements: 85, branches: 75 },
    },
  },
});
