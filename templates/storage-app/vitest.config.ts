import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/storage-flow.ts"],
      thresholds: { lines: 80, branches: 70 },
    },
  },
});
