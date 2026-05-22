import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/app.ts", "src/middleware.ts"],
      thresholds: { lines: 80, branches: 70 },
    },
  },
});
