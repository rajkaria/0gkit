import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/agent.ts", "src/tools.ts"],
      thresholds: { lines: 80, branches: 70 },
    },
  },
});
