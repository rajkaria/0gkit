import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      // bin.ts is just a 1-line shebang wrapper around run().
      // prompts.ts contains the interactive clack flow (TTY); its only
      // pure-logic helper `validateProjectName` is covered directly in
      // prompts.test.ts but vitest's per-file accounting still flags the
      // rest. The full interactive path is exercised by the gated e2e.
      // types.ts is pure type aliases — no runtime statements to cover.
      exclude: ["src/bin.ts", "src/prompts.ts", "src/types.ts", "src/__tests__/**"],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70,
      },
    },
  },
});
