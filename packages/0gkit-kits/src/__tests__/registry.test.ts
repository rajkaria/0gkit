import { describe, it, expect } from "vitest";
import { KitManifestSchema, type KitManifest } from "../manifest.js";
import { getKit, listKits, resolveTiers } from "../registry.js";

// ---------------------------------------------------------------------------
// Fixture manifests — NOT from the real (empty) registry.generated.ts
// ---------------------------------------------------------------------------

/** A kit with lib + adapter for "tee-attested-api" but NO ui tier. */
const libAdapterKit: KitManifest = KitManifestSchema.parse({
  name: "secure-storage",
  title: "Secure Storage",
  domain: "agent-infra",
  summary: "Encrypted file storage via 0G Storage.",
  compatibleBases: ["tee-attested-api", "node"],
  tiers: {
    lib: ["lib/secure-storage.ts"],
    adapters: {
      "tee-attested-api": ["adapters/tee-storage.ts"],
    },
  },
});

/** A UI-only kit that has NO lib and NO adapter — only compatible with React bases. */
const uiOnlyKit: KitManifest = KitManifestSchema.parse({
  name: "wallet-connect-ui",
  title: "Wallet Connect UI",
  domain: "assets",
  summary: "React wallet connection widget.",
  compatibleBases: ["react-app", "chat"],
  tiers: {
    lib: [],
    ui: ["components/WalletButton.tsx"],
  },
});

/** A fully featured kit with lib + adapters + ui for React bases. */
const fullKit: KitManifest = KitManifestSchema.parse({
  name: "agent-dashboard",
  title: "Agent Dashboard",
  domain: "verifiable-ai",
  summary: "Real-time agent task dashboard.",
  compatibleBases: ["react-app", "chat", "tee-attested-api"],
  tiers: {
    lib: ["lib/agent-dashboard.ts"],
    adapters: {
      "tee-attested-api": ["adapters/tee-dashboard.ts"],
    },
    ui: ["components/Dashboard.tsx"],
  },
});

const fixtures: KitManifest[] = [libAdapterKit, uiOnlyKit, fullKit];

// ---------------------------------------------------------------------------
// resolveTiers
// ---------------------------------------------------------------------------

describe("resolveTiers", () => {
  it("returns lib + adapter for a non-React base", () => {
    const tiers = resolveTiers(libAdapterKit, "tee-attested-api");
    expect(tiers).toContain("lib/secure-storage.ts");
    expect(tiers).toContain("adapters/tee-storage.ts");
    expect(tiers).not.toContain(expect.stringContaining("tsx"));
  });

  it("returns only lib for a non-React base with no adapter", () => {
    const tiers = resolveTiers(libAdapterKit, "node");
    expect(tiers).toContain("lib/secure-storage.ts");
    expect(tiers).not.toContain("adapters/tee-storage.ts");
  });

  it("returns lib only for a React base when the kit has no ui tier", () => {
    // libAdapterKit has no ui tier, so on react-app it only gets lib files
    const tiers = resolveTiers(libAdapterKit, "react-app");
    expect(tiers).toContain("lib/secure-storage.ts");
    expect(tiers).toHaveLength(1); // no adapter for react-app, no ui tier
  });

  it("returns lib + ui (no adapter) for a React base when adapter key differs", () => {
    // fullKit has adapter["tee-attested-api"], not adapter["react-app"]
    // On react-app: lib + ui, no adapter (key mismatch)
    const tiers = resolveTiers(fullKit, "react-app");
    expect(tiers).toContain("lib/agent-dashboard.ts");
    expect(tiers).toContain("components/Dashboard.tsx");
    expect(tiers).not.toContain("adapters/tee-dashboard.ts");
  });

  it("returns lib + adapter + ui for a React base when the adapter key matches a React base", () => {
    // Build a kit whose adapter key IS a React base
    const kitWithReactAdapter: KitManifest = KitManifestSchema.parse({
      name: "chat-memory",
      title: "Chat Memory",
      domain: "agent-infra",
      summary: "Memory for chat bases.",
      compatibleBases: ["chat"],
      tiers: {
        lib: ["lib/memory.ts"],
        adapters: { chat: ["adapters/chat-adapter.ts"] },
        ui: ["components/MemoryPanel.tsx"],
      },
    });
    const tiers = resolveTiers(kitWithReactAdapter, "chat");
    expect(tiers).toContain("lib/memory.ts");
    expect(tiers).toContain("adapters/chat-adapter.ts");
    expect(tiers).toContain("components/MemoryPanel.tsx");
  });

  it("returns empty array for UI-only kit on a non-React base (no lib, no adapter)", () => {
    const tiers = resolveTiers(uiOnlyKit, "tee-attested-api");
    expect(tiers).toHaveLength(0);
  });

  it("returns ui for UI-only kit on a React base", () => {
    const tiers = resolveTiers(uiOnlyKit, "react-app");
    expect(tiers).toContain("components/WalletButton.tsx");
  });
});

// ---------------------------------------------------------------------------
// listKits
// ---------------------------------------------------------------------------

describe("listKits", () => {
  it("returns all kits when no base filter is given", () => {
    const result = listKits({ registry: fixtures });
    expect(result).toHaveLength(3);
  });

  it("excludes the UI-only kit for tee-attested-api (not in compatibleBases + empty resolveTiers)", () => {
    const result = listKits({ base: "tee-attested-api", registry: fixtures });
    const names = result.map((k) => k.name);
    expect(names).toContain("secure-storage");
    expect(names).toContain("agent-dashboard");
    expect(names).not.toContain("wallet-connect-ui");
  });

  it("includes all react-compatible kits for react-app base", () => {
    const result = listKits({ base: "react-app", registry: fixtures });
    const names = result.map((k) => k.name);
    // ui-only kit is compatible with react-app and resolveTiers returns ui tier
    expect(names).toContain("wallet-connect-ui");
    expect(names).toContain("agent-dashboard");
    // secure-storage has react-app in compatibleBases? No — check: ["tee-attested-api", "node"]
    expect(names).not.toContain("secure-storage");
  });

  it("excludes kits whose base is not in compatibleBases even if tiers would be non-empty", () => {
    const result = listKits({ base: "mcp-agent", registry: fixtures });
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getKit
// ---------------------------------------------------------------------------

describe("getKit", () => {
  it("finds a kit by name in the provided registry", () => {
    const kit = getKit("secure-storage", fixtures);
    expect(kit).toBeDefined();
    expect(kit?.title).toBe("Secure Storage");
  });

  it("returns undefined for an unknown kit name", () => {
    const kit = getKit("agent-memory", fixtures);
    expect(kit).toBeUndefined();
  });
});
