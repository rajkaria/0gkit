/**
 * prediction-market — CI composition gate
 *
 * Verifies that:
 *   1. The prediction-market kit is in the real KITS registry.
 *   2. Its manifest has composes: ["ai-oracle"].
 *   3. applyKit({ kit: "prediction-market", base: "react-app", ... }) with a
 *      composition-aware local fetchOverlay ALSO writes lib/oracle.ts (ai-oracle's
 *      lib file) into the dest — proving the composition engine correctly applies
 *      the composed dep before the top-level kit.
 *   4. lib/market.ts is also written (the prediction-market lib).
 *
 * This test lives in the engine package test dir so it runs in the CI `test`
 * gate (`pnpm --filter @foundryprotocol/0gkit-kits test`) and can import the
 * built engine APIs (getKit, resolveTiers, applyKit). It is a TEST — not engine
 * source — so it is allowed to reference local kit files.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  copyFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { KitManifestSchema } from "../manifest.js";
import { getKit, resolveTiers } from "../registry.js";
import { applyKit } from "../apply.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// packages/0gkit-kits/src/__tests__  →  repo root
const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const KITS_DIR = join(REPO_ROOT, "templates", "_kits");

// ---------------------------------------------------------------------------
// Composition-aware local fetchOverlay (mirrors the fix in check-kits.mjs)
//
// The engine calls fetchOverlay(name, tmpDir) once per kit in the composition
// closure. This overlay resolves `name` to templates/_kits/<name>/ and copies
// that kit's tier files into tmpDir — same pattern as the fixed harness.
// ---------------------------------------------------------------------------

function makeFetchOverlay(kitsDir: string) {
  return async (name: string, tmpDir: string): Promise<void> => {
    const kitDir = join(kitsDir, name);
    const manifestPath = join(kitDir, "kit.json");
    if (!existsSync(manifestPath)) {
      throw new Error(`fetchOverlay: no kit.json found for kit "${name}" at ${kitDir}`);
    }
    const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
    const manifest = KitManifestSchema.parse(raw);

    // lib/* → tmpDir/<relPath>
    for (const relPath of manifest.tiers.lib ?? []) {
      const src = join(kitDir, "lib", relPath.replace(/^lib\//, ""));
      const dest = join(tmpDir, relPath);
      mkdirSync(dirname(dest), { recursive: true });
      if (existsSync(src)) copyFileSync(src, dest);
    }

    // adapters/<base>/<relPath> → tmpDir/<relPath>  (all bases)
    for (const [base, files] of Object.entries(manifest.tiers.adapters ?? {})) {
      for (const relPath of files as string[]) {
        const src = join(kitDir, "adapters", base, relPath);
        const dest = join(tmpDir, relPath);
        mkdirSync(dirname(dest), { recursive: true });
        if (existsSync(src)) copyFileSync(src, dest);
      }
    }

    // ui/* → tmpDir/<relPath>
    for (const relPath of manifest.tiers.ui ?? []) {
      const src = join(kitDir, "ui", relPath);
      const dest = join(tmpDir, relPath);
      mkdirSync(dirname(dest), { recursive: true });
      if (existsSync(src)) copyFileSync(src, dest);
    }
  };
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeMinimalDest(root: string): string {
  const dest = join(root, "dest");
  mkdirSync(dest, { recursive: true });
  // Write a package.json with all required deps so applyKit passes requires check
  const pkg = {
    name: "test-app",
    dependencies: {
      "@foundryprotocol/0gkit-compute": "^1.0.0",
      "@foundryprotocol/0gkit-attestation": "^1.0.0",
      "@foundryprotocol/0gkit-storage": "^1.0.0",
      "@foundryprotocol/0gkit-contracts": "^1.0.0",
      "@foundryprotocol/0gkit-wallet": "^1.0.0",
      "@foundryprotocol/0gkit-core": "^1.0.0",
    },
  };
  writeFileSync(join(dest, "package.json"), JSON.stringify(pkg, null, 2));
  return dest;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "pm-composition-test-"));
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Registry checks
// ---------------------------------------------------------------------------

describe("prediction-market — manifest embedding", () => {
  it("getKit('prediction-market') resolves from the real KITS registry", () => {
    const kit = getKit("prediction-market");
    expect(kit).toBeDefined();
  });

  it("manifest validates against KitManifestSchema", () => {
    const kit = getKit("prediction-market");
    expect(() => KitManifestSchema.parse(kit)).not.toThrow();
  });

  it("has domain 'markets'", () => {
    const kit = getKit("prediction-market");
    expect(kit?.domain).toBe("markets");
  });

  it("composes includes 'ai-oracle'", () => {
    const kit = getKit("prediction-market");
    expect(kit?.composes).toContain("ai-oracle");
  });

  it("compatibleBases includes react-app, chat, tee-attested-api", () => {
    const kit = getKit("prediction-market");
    expect(kit?.compatibleBases).toContain("react-app");
    expect(kit?.compatibleBases).toContain("chat");
    expect(kit?.compatibleBases).toContain("tee-attested-api");
  });

  it("tiers.lib contains lib/market.ts", () => {
    const kit = getKit("prediction-market");
    expect(kit?.tiers.lib).toContain("lib/market.ts");
  });

  it("tiers.adapters['react-app'] contains app/api/markets/route.ts", () => {
    const kit = getKit("prediction-market");
    expect(kit?.tiers.adapters?.["react-app"]).toContain("app/api/markets/route.ts");
  });

  it("tiers.adapters['tee-attested-api'] contains src/routes/markets.ts", () => {
    const kit = getKit("prediction-market");
    expect(kit?.tiers.adapters?.["tee-attested-api"]).toContain("src/routes/markets.ts");
  });

  it("dependencies includes @foundryprotocol/0gkit-storage", () => {
    const kit = getKit("prediction-market");
    expect(kit?.dependencies).toHaveProperty("@foundryprotocol/0gkit-storage");
  });

  it("dependencies includes @foundryprotocol/0gkit-core", () => {
    const kit = getKit("prediction-market");
    expect(kit?.dependencies).toHaveProperty("@foundryprotocol/0gkit-core");
  });

  it("requires is empty (all deps are self-supplied via dependencies)", () => {
    const kit = getKit("prediction-market");
    expect(kit?.requires).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// resolveTiers
// ---------------------------------------------------------------------------

describe("prediction-market — resolveTiers", () => {
  it("resolveTiers(kit, 'react-app') includes lib + adapter + ui files", () => {
    const kit = getKit("prediction-market");
    expect(kit).toBeDefined();
    const tiers = resolveTiers(kit!, "react-app");
    expect(tiers).toContain("lib/market.ts");
    expect(tiers).toContain("app/api/markets/route.ts");
    expect(tiers).toContain("app/markets/page.tsx");
    expect(tiers).toContain("components/MarketBoard.tsx");
    expect(tiers).toContain("components/CreateMarketForm.tsx");
  });

  it("resolveTiers(kit, 'tee-attested-api') includes lib + adapter but NOT Next.js ui", () => {
    const kit = getKit("prediction-market");
    expect(kit).toBeDefined();
    const tiers = resolveTiers(kit!, "tee-attested-api");
    expect(tiers).toContain("lib/market.ts");
    expect(tiers).toContain("src/routes/markets.ts");
    // tee-attested-api is not a React base — no UI tier
    expect(tiers).not.toContain("components/MarketBoard.tsx");
  });
});

// ---------------------------------------------------------------------------
// Composition test — THE KEY ASSERTION
// applyKit with prediction-market must ALSO write lib/oracle.ts (from ai-oracle)
// ---------------------------------------------------------------------------

describe("prediction-market — composition (applyKit writes ai-oracle's lib/oracle.ts)", () => {
  it("applying prediction-market × react-app also writes lib/oracle.ts (composed ai-oracle lib)", async () => {
    const dest = makeMinimalDest(tmpRoot);
    const fetchOverlay = makeFetchOverlay(KITS_DIR);

    const result = await applyKit({
      kit: "prediction-market",
      base: "react-app",
      dest,
      deps: { fetchOverlay },
    });

    // The composition engine applies both ai-oracle and prediction-market
    expect(result.applied).toContain("ai-oracle");
    expect(result.applied).toContain("prediction-market");

    // ai-oracle is applied BEFORE prediction-market (deps-first order)
    const aiOracleIdx = result.applied.indexOf("ai-oracle");
    const pmIdx = result.applied.indexOf("prediction-market");
    expect(aiOracleIdx).toBeLessThan(pmIdx);

    // lib/oracle.ts MUST be written (ai-oracle's lib file)
    expect(result.filesWritten).toContain("lib/oracle.ts");
    expect(existsSync(join(dest, "lib", "oracle.ts"))).toBe(true);

    // lib/market.ts MUST also be written (prediction-market's own lib)
    expect(result.filesWritten).toContain("lib/market.ts");
    expect(existsSync(join(dest, "lib", "market.ts"))).toBe(true);

    // The prediction-market adapter must be written
    expect(result.filesWritten).toContain("app/api/markets/route.ts");
    expect(existsSync(join(dest, "app", "api", "markets", "route.ts"))).toBe(true);
  });

  it("applying prediction-market × tee-attested-api also writes lib/oracle.ts", async () => {
    const dest = makeMinimalDest(tmpRoot);
    const fetchOverlay = makeFetchOverlay(KITS_DIR);

    const result = await applyKit({
      kit: "prediction-market",
      base: "tee-attested-api",
      dest,
      deps: { fetchOverlay },
    });

    expect(result.applied).toContain("ai-oracle");
    expect(result.applied).toContain("prediction-market");
    expect(result.filesWritten).toContain("lib/oracle.ts");
    expect(existsSync(join(dest, "lib", "oracle.ts"))).toBe(true);
    expect(result.filesWritten).toContain("lib/market.ts");
  });

  it("dry-run lists both ai-oracle and prediction-market files", async () => {
    const dest = makeMinimalDest(tmpRoot);
    const fetchOverlay = makeFetchOverlay(KITS_DIR);

    const result = await applyKit({
      kit: "prediction-market",
      base: "react-app",
      dest,
      dryRun: true,
      deps: { fetchOverlay },
    });

    expect(result.applied).toContain("ai-oracle");
    expect(result.applied).toContain("prediction-market");
    expect(result.filesWritten).toContain("lib/oracle.ts");
    expect(result.filesWritten).toContain("lib/market.ts");
  });
});
