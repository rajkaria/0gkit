import { describe, expect, it } from "vitest";
import { z } from "zod";
import { jobs } from "../index.js";

describe("jobs.define", () => {
  it("returns a JobDefinition with the configured schemas + handler", () => {
    const def = jobs.define({
      name: "echo",
      input: z.object({ text: z.string() }),
      output: z.object({ text: z.string() }),
      handler: async ({ input }) => ({ text: input.text }),
    });
    expect(def.name).toBe("echo");
    expect(def.maxAttempts).toBe(3);
    expect(def.backoffMs(1)).toBeGreaterThan(0);
  });

  it("validates input via the zod schema (throws on bad input)", () => {
    const def = jobs.define({
      name: "echo",
      input: z.object({ text: z.string() }),
      output: z.object({ text: z.string() }),
      handler: async ({ input }) => ({ text: input.text }),
    });
    expect(() => def.inputSchema.parse({ text: 42 })).toThrow();
  });

  it("respects custom maxAttempts and backoff", () => {
    const def = jobs.define({
      name: "x",
      input: z.unknown(),
      output: z.unknown(),
      handler: async () => null,
      maxAttempts: 5,
      backoffMs: (attempt) => attempt * 1000,
    });
    expect(def.maxAttempts).toBe(5);
    expect(def.backoffMs(3)).toBe(3000);
  });

  it("default backoff is bounded under 60s", () => {
    const def = jobs.define({
      name: "x",
      input: z.unknown(),
      output: z.unknown(),
      handler: async () => null,
    });
    for (let attempt = 1; attempt <= 30; attempt++) {
      expect(def.backoffMs(attempt)).toBeLessThanOrEqual(60_000);
      expect(def.backoffMs(attempt)).toBeGreaterThan(0);
    }
  });
});
