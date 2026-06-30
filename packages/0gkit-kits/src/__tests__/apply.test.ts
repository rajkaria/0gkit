import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { rm } from "node:fs/promises";
import { KitManifestSchema, type KitManifest } from "../manifest.js";
import { applyKit, KitError } from "../apply.js";
import type { ApplyDeps } from "../apply.js";

// ---------------------------------------------------------------------------
// Fixture manifests
// ---------------------------------------------------------------------------

/** A lib-only kit — compatible with both react-app and node */
const depKit: KitManifest = KitManifestSchema.parse({
  name: "dep-kit",
  title: "Dep Kit",
  domain: "agent-infra",
  summary: "A composed dependency kit.",
  compatibleBases: ["react-app", "node"],
  tiers: {
    lib: ["lib/dep.ts"],
  },
  env: [{ key: "DEP_API_KEY", example: "dep-secret", note: "Dep API key" }],
  dependencies: { "some-dep": "^1.0.0" },
  requires: ["0gkit-core"],
});

/** Main kit — composes dep-kit, has its own lib + ui tier */
const mainKit: KitManifest = KitManifestSchema.parse({
  name: "main-kit",
  title: "Main Kit",
  domain: "verifiable-ai",
  summary: "The main kit that composes dep-kit.",
  compatibleBases: ["react-app", "node"],
  tiers: {
    lib: ["lib/main.ts"],
    ui: ["components/Main.tsx"],
  },
  env: [{ key: "MAIN_SECRET", example: "main-secret", note: "Main secret" }],
  dependencies: { "main-dep": "^2.0.0" },
  devDependencies: { "main-dev-dep": "^0.1.0" },
  composes: ["dep-kit"],
  requires: ["0gkit-core"],
});

/** A kit that conflicts with main-kit */
const conflictKit: KitManifest = KitManifestSchema.parse({
  name: "conflict-kit",
  title: "Conflict Kit",
  domain: "markets",
  summary: "A kit that conflicts with main-kit.",
  compatibleBases: ["react-app", "node"],
  tiers: {
    lib: ["lib/conflict.ts"],
  },
  conflicts: ["main-kit"],
  requires: ["0gkit-core"],
});

/** A standalone kit with no composes or conflicts */
const standaloneKit: KitManifest = KitManifestSchema.parse({
  name: "standalone-kit",
  title: "Standalone Kit",
  domain: "defi",
  summary: "A standalone kit.",
  compatibleBases: ["node"],
  tiers: {
    lib: ["lib/standalone.ts"],
  },
  requires: ["0gkit-nonexistent-package"],
});

/** Node-only kit - not compatible with react-app */
const nodeOnlyKit: KitManifest = KitManifestSchema.parse({
  name: "node-only-kit",
  title: "Node Only Kit",
  domain: "defi",
  summary: "Only for node base.",
  compatibleBases: ["node"],
  tiers: {
    lib: ["lib/node-only.ts"],
  },
});

const TEST_REGISTRY: KitManifest[] = [
  depKit,
  mainKit,
  conflictKit,
  standaloneKit,
  nodeOnlyKit,
];

// ---------------------------------------------------------------------------
// Fake fetchOverlay — writes trivial tier files into the temp dir
// ---------------------------------------------------------------------------

function makeFakeFetchOverlay(registry: KitManifest[]) {
  return async (name: string, dir: string): Promise<void> => {
    const manifest = registry.find((k) => k.name === name);
    if (!manifest) throw new Error(`fake fetchOverlay: unknown kit "${name}"`);

    const allFiles = [
      ...manifest.tiers.lib,
      ...(manifest.tiers.ui ?? []),
      ...Object.values(manifest.tiers.adapters ?? {}).flat(),
    ];

    for (const relPath of allFiles) {
      const absPath = join(dir, relPath);
      const parentDir = absPath.substring(0, absPath.lastIndexOf("/"));
      mkdirSync(parentDir, { recursive: true });
      writeFileSync(absPath, `// ${name}: ${relPath}\n`, "utf8");
    }
  };
}

// ---------------------------------------------------------------------------
// Test setup — temp dest directory
// ---------------------------------------------------------------------------

let dest: string;

/** Seed package.json that satisfies requires checks (has @foundryprotocol/0gkit-core) */
function seedPackageJson(extra?: Record<string, unknown>) {
  const pkg = {
    name: "test-project",
    version: "1.0.0",
    dependencies: {
      "@foundryprotocol/0gkit-core": "^1.5.0",
    },
    ...extra,
  };
  writeFileSync(join(dest, "package.json"), JSON.stringify(pkg, null, 2), "utf8");
}

function makeDeps(overrides?: Partial<ApplyDeps>): ApplyDeps {
  return {
    fetchOverlay: makeFakeFetchOverlay(TEST_REGISTRY),
    registry: TEST_REGISTRY,
    ...overrides,
  };
}

beforeEach(() => {
  dest = mkdtempSync(join(tmpdir(), "0gkit-apply-test-"));
  seedPackageJson();
});

afterEach(async () => {
  await rm(dest, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Composition ordering: dep-kit must appear BEFORE main-kit
// ---------------------------------------------------------------------------

describe("composition ordering", () => {
  it("applies composed dependencies before the requesting kit", async () => {
    const result = await applyKit({
      kit: "main-kit",
      dest,
      base: "react-app",
      deps: makeDeps(),
    });

    expect(result.applied).toContain("dep-kit");
    expect(result.applied).toContain("main-kit");

    // dep-kit must come BEFORE main-kit
    const depIdx = result.applied.indexOf("dep-kit");
    const mainIdx = result.applied.indexOf("main-kit");
    expect(depIdx).toBeLessThan(mainIdx);
  });

  it("deduplicates kits when the same kit would appear twice in the closure", async () => {
    // Create a kit that also composes dep-kit (via main-kit + direct)
    const doubleKit: KitManifest = KitManifestSchema.parse({
      name: "double-kit",
      title: "Double Kit",
      domain: "agent-infra",
      summary: "Composes both main-kit (which composes dep-kit) and dep-kit directly.",
      compatibleBases: ["react-app"],
      tiers: { lib: ["lib/double.ts"] },
      composes: ["dep-kit", "main-kit"],
      requires: ["0gkit-core"],
    });

    const registry = [...TEST_REGISTRY, doubleKit];
    const deps: ApplyDeps = {
      fetchOverlay: makeFakeFetchOverlay(registry),
      registry,
    };

    const result = await applyKit({ kit: "double-kit", dest, base: "react-app", deps });

    // dep-kit must appear exactly once
    const depCount = result.applied.filter((n) => n === "dep-kit").length;
    expect(depCount).toBe(1);

    // ordering: dep-kit < main-kit < double-kit
    const depIdx = result.applied.indexOf("dep-kit");
    const mainIdx = result.applied.indexOf("main-kit");
    const doubleIdx = result.applied.indexOf("double-kit");
    expect(depIdx).toBeLessThan(mainIdx);
    expect(mainIdx).toBeLessThan(doubleIdx);
  });
});

// ---------------------------------------------------------------------------
// File writes
// ---------------------------------------------------------------------------

describe("file writes", () => {
  it("writes tier files to dest", async () => {
    const result = await applyKit({
      kit: "main-kit",
      dest,
      base: "react-app",
      deps: makeDeps(),
    });

    // All declared files should be written
    expect(result.filesWritten).toContain("lib/dep.ts"); // from dep-kit
    expect(result.filesWritten).toContain("lib/main.ts"); // from main-kit
    expect(result.filesWritten).toContain("components/Main.tsx"); // ui tier (react-app)

    // Verify files actually exist
    expect(existsSync(join(dest, "lib/dep.ts"))).toBe(true);
    expect(existsSync(join(dest, "lib/main.ts"))).toBe(true);
    expect(existsSync(join(dest, "components/Main.tsx"))).toBe(true);
  });

  it("does NOT write ui tier files for a non-React base", async () => {
    const result = await applyKit({
      kit: "main-kit",
      dest,
      base: "node",
      deps: makeDeps(),
    });

    expect(result.filesWritten).not.toContain("components/Main.tsx");
    expect(existsSync(join(dest, "components/Main.tsx"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// package.json deps
// ---------------------------------------------------------------------------

describe("package.json deps", () => {
  it("merges dependencies from all kits in the composition into dest/package.json", async () => {
    await applyKit({ kit: "main-kit", dest, base: "react-app", deps: makeDeps() });

    const pkg = JSON.parse(readFileSync(join(dest, "package.json"), "utf8"));
    expect(pkg.dependencies?.["some-dep"]).toBe("^1.0.0"); // from dep-kit
    expect(pkg.dependencies?.["main-dep"]).toBe("^2.0.0"); // from main-kit
    expect(pkg.devDependencies?.["main-dev-dep"]).toBe("^0.1.0"); // from main-kit devDeps
  });
});

// ---------------------------------------------------------------------------
// Env vars
// ---------------------------------------------------------------------------

describe("env vars", () => {
  it("appends env vars from all kits to dest/.env.example", async () => {
    const result = await applyKit({
      kit: "main-kit",
      dest,
      base: "react-app",
      deps: makeDeps(),
    });

    const envContent = readFileSync(join(dest, ".env.example"), "utf8");
    expect(envContent).toContain("DEP_API_KEY=dep-secret");
    expect(envContent).toContain("MAIN_SECRET=main-secret");

    expect(result.envAdded).toContain("DEP_API_KEY");
    expect(result.envAdded).toContain("MAIN_SECRET");
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe("idempotency", () => {
  it("re-applying the same kit produces a byte-identical .env.example", async () => {
    await applyKit({ kit: "main-kit", dest, base: "react-app", deps: makeDeps() });
    const envAfterFirst = readFileSync(join(dest, ".env.example"), "utf8");

    await applyKit({ kit: "main-kit", dest, base: "react-app", deps: makeDeps() });
    const envAfterSecond = readFileSync(join(dest, ".env.example"), "utf8");

    expect(envAfterFirst).toBe(envAfterSecond);
  });

  it("re-applying the same kit does not duplicate or alter existing package.json deps", async () => {
    await applyKit({ kit: "main-kit", dest, base: "react-app", deps: makeDeps() });
    const pkgAfterFirst = JSON.parse(readFileSync(join(dest, "package.json"), "utf8"));

    await applyKit({ kit: "main-kit", dest, base: "react-app", deps: makeDeps() });
    const pkgAfterSecond = JSON.parse(readFileSync(join(dest, "package.json"), "utf8"));

    expect(pkgAfterFirst).toEqual(pkgAfterSecond);
  });

  it("re-applying does not change the envAdded count on second run (all already present)", async () => {
    await applyKit({ kit: "main-kit", dest, base: "react-app", deps: makeDeps() });
    const result2 = await applyKit({
      kit: "main-kit",
      dest,
      base: "react-app",
      deps: makeDeps(),
    });

    // On re-apply, appendEnv is idempotent so envAdded should report 0 new keys
    expect(result2.envAdded).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

describe("conflict detection", () => {
  it("throws KitError(KIT_CONFLICT) when applying a kit that conflicts with another requested kit", async () => {
    // Build a super-kit that composes both main-kit and conflict-kit
    const badKit: KitManifest = KitManifestSchema.parse({
      name: "bad-kit",
      title: "Bad Kit",
      domain: "markets",
      summary: "Composes conflicting kits.",
      compatibleBases: ["react-app"],
      tiers: { lib: ["lib/bad.ts"] },
      composes: ["main-kit", "conflict-kit"],
      requires: ["0gkit-core"],
    });

    const registry = [...TEST_REGISTRY, badKit];
    const deps: ApplyDeps = {
      fetchOverlay: makeFakeFetchOverlay(registry),
      registry,
    };

    await expect(
      applyKit({ kit: "bad-kit", dest, base: "react-app", deps })
    ).rejects.toSatisfy((e: unknown) => {
      return e instanceof KitError && e.code === "KIT_CONFLICT";
    });
  });
});

// ---------------------------------------------------------------------------
// Missing requires
// ---------------------------------------------------------------------------

describe("missing requires", () => {
  it("throws KitError(KIT_MISSING_REQUIRES) when dest package.json is missing a required package", async () => {
    // standalone-kit requires "0gkit-nonexistent-package" which the seed package.json doesn't have
    await expect(
      applyKit({ kit: "standalone-kit", dest, base: "node", deps: makeDeps() })
    ).rejects.toSatisfy((e: unknown) => {
      return e instanceof KitError && e.code === "KIT_MISSING_REQUIRES";
    });
  });

  it("does not throw when all required packages are present", async () => {
    // main-kit requires "0gkit-core" which the seed package.json has
    await expect(
      applyKit({ kit: "dep-kit", dest, base: "node", deps: makeDeps() })
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// KIT_NOT_FOUND
// ---------------------------------------------------------------------------

describe("kit not found", () => {
  it("throws KitError(KIT_NOT_FOUND) when the requested kit does not exist", async () => {
    await expect(
      applyKit({ kit: "nonexistent-kit", dest, base: "node", deps: makeDeps() })
    ).rejects.toSatisfy((e: unknown) => {
      return e instanceof KitError && e.code === "KIT_NOT_FOUND";
    });
  });

  it("throws KitError(KIT_NOT_FOUND) when a composed kit does not exist", async () => {
    const badComposeKit: KitManifest = KitManifestSchema.parse({
      name: "bad-compose-kit",
      title: "Bad Compose Kit",
      domain: "defi",
      summary: "Composes a nonexistent kit.",
      compatibleBases: ["node"],
      tiers: { lib: ["lib/bad.ts"] },
      composes: ["nonexistent-dep"],
    });

    const registry = [...TEST_REGISTRY, badComposeKit];
    const deps: ApplyDeps = {
      fetchOverlay: makeFakeFetchOverlay(registry),
      registry,
    };

    await expect(
      applyKit({ kit: "bad-compose-kit", dest, base: "node", deps })
    ).rejects.toSatisfy((e: unknown) => {
      return e instanceof KitError && e.code === "KIT_NOT_FOUND";
    });
  });
});

// ---------------------------------------------------------------------------
// dryRun
// ---------------------------------------------------------------------------

describe("dryRun", () => {
  it("returns the plan without writing any files", async () => {
    const result = await applyKit({
      kit: "main-kit",
      dest,
      base: "react-app",
      dryRun: true,
      deps: makeDeps(),
    });

    // Files should be listed in the plan
    expect(result.filesWritten.length).toBeGreaterThan(0);
    expect(result.applied).toContain("dep-kit");
    expect(result.applied).toContain("main-kit");

    // But nothing should actually be written
    expect(existsSync(join(dest, "lib/dep.ts"))).toBe(false);
    expect(existsSync(join(dest, "lib/main.ts"))).toBe(false);
    expect(existsSync(join(dest, ".env.example"))).toBe(false);

    // Package.json should be unchanged (seed only)
    const pkg = JSON.parse(readFileSync(join(dest, "package.json"), "utf8"));
    expect(pkg.dependencies?.["some-dep"]).toBeUndefined();

    // Notes should mention dry-run
    expect(result.notes.some((n) => n.toLowerCase().includes("dry"))).toBe(true);
  });

  it("has the correct token in dryRun mode", async () => {
    const result = await applyKit({
      kit: "dep-kit",
      dest,
      base: "node",
      dryRun: true,
      deps: makeDeps(),
    });

    expect(result.token).toBe("[0gkit:kit-applied]");
  });
});

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

describe("result shape", () => {
  it("returns the correct token", async () => {
    const result = await applyKit({
      kit: "dep-kit",
      dest,
      base: "node",
      deps: makeDeps(),
    });

    expect(result.token).toBe("[0gkit:kit-applied]");
  });

  it("returns applied, filesWritten, envAdded, notes arrays", async () => {
    const result = await applyKit({
      kit: "dep-kit",
      dest,
      base: "node",
      deps: makeDeps(),
    });

    expect(Array.isArray(result.applied)).toBe(true);
    expect(Array.isArray(result.filesWritten)).toBe(true);
    expect(Array.isArray(result.envAdded)).toBe(true);
    expect(Array.isArray(result.notes)).toBe(true);
  });
});
