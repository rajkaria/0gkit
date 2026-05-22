import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["lib/message.ts"],
      thresholds: { lines: 80, branches: 70 },
    },
  },
});
