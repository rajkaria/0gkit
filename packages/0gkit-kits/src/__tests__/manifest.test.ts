import { describe, it, expect } from "vitest";
import { KitManifestSchema } from "../manifest.js";

describe("KitManifestSchema", () => {
  it("accepts a minimal lib-only kit", () => {
    const m = KitManifestSchema.parse({
      name: "agent-memory",
      title: "Agent Memory",
      domain: "agent-infra",
      summary: "Persistent agent memory on 0G Storage.",
      compatibleBases: ["react-app", "mcp-agent", "storage-app"],
      tiers: { lib: ["lib/agent-memory.ts"] },
    });
    expect(m.name).toBe("agent-memory");
    expect(m.tiers.adapters).toBeUndefined();
  });

  it("rejects a kit whose name is not kebab-case", () => {
    expect(() =>
      KitManifestSchema.parse({
        name: "Agent Memory",
        title: "x",
        domain: "agent-infra",
        summary: "x",
        compatibleBases: ["react-app"],
        tiers: { lib: ["lib/a.ts"] },
      })
    ).toThrow();
  });
});
