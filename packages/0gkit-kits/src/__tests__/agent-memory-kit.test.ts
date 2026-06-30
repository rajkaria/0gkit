/**
 * Task 7 gate: verifies the agent-memory kit is correctly embedded in the
 * real build-time registry (KITS from registry.generated.ts).
 *
 * These tests exercise getKit / listKits / resolveTiers against the LIVE
 * generated registry, not a fixture. Running `pnpm --filter @foundryprotocol/0gkit-kits test`
 * will first execute the `pretest` npm hook which runs gen-registry.mjs so the
 * registry is always up to date before the tests run.
 */

import { describe, it, expect } from "vitest";
import { KitManifestSchema } from "../manifest.js";
import { getKit, listKits, resolveTiers } from "../registry.js";

// ---------------------------------------------------------------------------
// Manifest shape
// ---------------------------------------------------------------------------

describe("agent-memory — manifest embedding", () => {
  it("getKit('agent-memory') resolves from the real KITS registry", () => {
    const kit = getKit("agent-memory");
    expect(kit).toBeDefined();
  });

  it("manifest validates against KitManifestSchema", () => {
    const kit = getKit("agent-memory");
    expect(() => KitManifestSchema.parse(kit)).not.toThrow();
  });

  it("has domain 'agent-infra'", () => {
    const kit = getKit("agent-memory");
    expect(kit?.domain).toBe("agent-infra");
  });

  it("compatibleBases includes react-app, chat, storage-app, mcp-agent", () => {
    const kit = getKit("agent-memory");
    expect(kit?.compatibleBases).toContain("react-app");
    expect(kit?.compatibleBases).toContain("chat");
    expect(kit?.compatibleBases).toContain("storage-app");
    expect(kit?.compatibleBases).toContain("mcp-agent");
  });

  it("tiers.lib contains lib/agent-memory.ts", () => {
    const kit = getKit("agent-memory");
    expect(kit?.tiers.lib).toContain("lib/agent-memory.ts");
  });

  it("tiers.adapters['mcp-agent'] contains src/tools/memory.ts", () => {
    const kit = getKit("agent-memory");
    expect(kit?.tiers.adapters?.["mcp-agent"]).toContain("src/tools/memory.ts");
  });

  it("tiers.adapters['react-app'] contains app/api/memory/route.ts", () => {
    const kit = getKit("agent-memory");
    expect(kit?.tiers.adapters?.["react-app"]).toContain("app/api/memory/route.ts");
  });

  it("tiers.ui contains MemoryPanel.tsx and useAgentMemory.ts", () => {
    const kit = getKit("agent-memory");
    expect(kit?.tiers.ui).toContain("components/MemoryPanel.tsx");
    expect(kit?.tiers.ui).toContain("hooks/useAgentMemory.ts");
  });

  it("requires ['0gkit-storage']", () => {
    const kit = getKit("agent-memory");
    expect(kit?.requires).toContain("0gkit-storage");
  });
});

// ---------------------------------------------------------------------------
// listKits filtering
// ---------------------------------------------------------------------------

describe("agent-memory — listKits filtering", () => {
  it("appears in listKits({ base: 'storage-app' }) (lib-only applies on every compatible base)", () => {
    const kits = listKits({ base: "storage-app" });
    const names = kits.map((k) => k.name);
    expect(names).toContain("agent-memory");
  });

  it("appears in listKits({ base: 'mcp-agent' })", () => {
    const kits = listKits({ base: "mcp-agent" });
    const names = kits.map((k) => k.name);
    expect(names).toContain("agent-memory");
  });

  it("appears in listKits({ base: 'react-app' })", () => {
    const kits = listKits({ base: "react-app" });
    const names = kits.map((k) => k.name);
    expect(names).toContain("agent-memory");
  });

  it("appears in listKits() (no filter)", () => {
    const kits = listKits();
    const names = kits.map((k) => k.name);
    expect(names).toContain("agent-memory");
  });
});

// ---------------------------------------------------------------------------
// resolveTiers
// ---------------------------------------------------------------------------

describe("agent-memory — resolveTiers", () => {
  it("resolveTiers(kit, 'react-app') includes ui files (react base)", () => {
    const kit = getKit("agent-memory");
    expect(kit).toBeDefined();
    const tiers = resolveTiers(kit!, "react-app");

    // lib always present
    expect(tiers).toContain("lib/agent-memory.ts");
    // react-app adapter
    expect(tiers).toContain("app/api/memory/route.ts");
    // ui tier (react-app IS a React base)
    expect(tiers).toContain("components/MemoryPanel.tsx");
    expect(tiers).toContain("hooks/useAgentMemory.ts");
  });

  it("resolveTiers(kit, 'mcp-agent') includes mcp adapter but NOT ui files", () => {
    const kit = getKit("agent-memory");
    expect(kit).toBeDefined();
    const tiers = resolveTiers(kit!, "mcp-agent");

    // lib present
    expect(tiers).toContain("lib/agent-memory.ts");
    // mcp-agent adapter present
    expect(tiers).toContain("src/tools/memory.ts");
    // ui tier absent — mcp-agent is NOT a React base
    expect(tiers).not.toContain("components/MemoryPanel.tsx");
    expect(tiers).not.toContain("hooks/useAgentMemory.ts");
    // react-app adapter absent
    expect(tiers).not.toContain("app/api/memory/route.ts");
  });

  it("resolveTiers(kit, 'chat') includes lib + ui (chat is a React base, no adapter key)", () => {
    const kit = getKit("agent-memory");
    expect(kit).toBeDefined();
    const tiers = resolveTiers(kit!, "chat");

    expect(tiers).toContain("lib/agent-memory.ts");
    // no adapter for 'chat', but ui tier applies (chat IS React base)
    expect(tiers).toContain("components/MemoryPanel.tsx");
    expect(tiers).not.toContain("src/tools/memory.ts");
    expect(tiers).not.toContain("app/api/memory/route.ts");
  });

  it("resolveTiers(kit, 'storage-app') returns only lib (not React, no adapter)", () => {
    const kit = getKit("agent-memory");
    expect(kit).toBeDefined();
    const tiers = resolveTiers(kit!, "storage-app");

    expect(tiers).toContain("lib/agent-memory.ts");
    expect(tiers).not.toContain("components/MemoryPanel.tsx");
    expect(tiers).not.toContain("src/tools/memory.ts");
    expect(tiers).not.toContain("app/api/memory/route.ts");
  });
});
