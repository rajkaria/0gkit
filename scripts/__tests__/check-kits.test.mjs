// Unit tests for check-kits.mjs pure functions (no scaffolding, no network).
// Run via: node --test scripts/__tests__/check-kits.test.mjs
//       or: pnpm test:scripts

import { describe, it, before } from "node:test";
import { strict as assert } from "node:assert";
import { tmpdir } from "node:os";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scratch() {
  return mkdtempSync(join(tmpdir(), "check-kits-test-"));
}

/**
 * Make a minimal valid kit fixture at <root>/kits/<name>/
 * Returns the path to the kit directory.
 */
function makeValidKitFixture(root, name = "test-kit", overrides = {}) {
  const kitDir = join(root, name);
  mkdirSync(join(kitDir, "lib"), { recursive: true });
  mkdirSync(join(kitDir, "ui", "components"), { recursive: true });

  // Tier files on disk
  writeFileSync(join(kitDir, "lib", "agent-memory.ts"), "// lib\n");
  writeFileSync(join(kitDir, "ui", "components", "Panel.tsx"), "// ui\n");

  const manifest = {
    name,
    title: "Test Kit",
    domain: "agent-infra",
    summary: "A valid test kit.",
    compatibleBases: ["storage-app"],
    tiers: {
      lib: ["lib/agent-memory.ts"],
      ui: ["components/Panel.tsx"],
    },
    requires: [],
    env: [],
    dependencies: {},
    devDependencies: {},
    composes: [],
    conflicts: [],
    ...overrides,
  };

  writeFileSync(join(kitDir, "kit.json"), JSON.stringify(manifest, null, 2));
  return kitDir;
}

// ---------------------------------------------------------------------------
// Import under test (lazy — avoids top-level await issues in test runner)
// ---------------------------------------------------------------------------

let mod;
before(async () => {
  // Import from source URL so the test is path-independent.
  const url = new URL("../check-kits.mjs", import.meta.url).href;
  mod = await import(url);
});

// ---------------------------------------------------------------------------
// parseKitManifest
// ---------------------------------------------------------------------------

describe("parseKitManifest", () => {
  it("accepts a valid kit.json", () => {
    const root = scratch();
    const kitDir = makeValidKitFixture(root);
    const result = mod.parseKitManifest(kitDir);
    assert.equal(result.ok, true, `Expected ok=true, got error: ${result.error}`);
    assert.equal(result.manifest.name, "test-kit");
  });

  it("fails when kit.json is absent", () => {
    const root = scratch();
    const result = mod.parseKitManifest(join(root, "no-kit"));
    assert.equal(result.ok, false);
    assert.ok(result.error.includes("kit.json not found"));
  });

  it("fails when kit.json has invalid JSON", () => {
    const root = scratch();
    const kitDir = join(root, "bad-json-kit");
    mkdirSync(kitDir, { recursive: true });
    writeFileSync(join(kitDir, "kit.json"), "{ not json");
    const result = mod.parseKitManifest(kitDir);
    assert.equal(result.ok, false);
    assert.ok(result.error.includes("not valid JSON"));
  });

  it("fails when kit.json fails schema validation (missing required fields)", () => {
    const root = scratch();
    const kitDir = join(root, "schema-fail-kit");
    mkdirSync(kitDir, { recursive: true });
    // Missing required: title, domain, summary, compatibleBases, tiers
    writeFileSync(join(kitDir, "kit.json"), JSON.stringify({ name: "schema-fail-kit" }));
    const result = mod.parseKitManifest(kitDir);
    assert.equal(result.ok, false);
    assert.ok(
      result.error.includes("KitManifestSchema validation failed"),
      `Expected schema error, got: ${result.error}`,
    );
  });

  it("fails when kit name is not kebab-case", () => {
    const root = scratch();
    const kitDir = join(root, "bad_name_kit");
    mkdirSync(kitDir, { recursive: true });
    writeFileSync(
      join(kitDir, "kit.json"),
      JSON.stringify({
        name: "Bad_Name", // invalid: uppercase + underscore
        title: "T",
        domain: "agent-infra",
        summary: "s",
        compatibleBases: ["storage-app"],
        tiers: { lib: [] },
      }),
    );
    const result = mod.parseKitManifest(kitDir);
    assert.equal(result.ok, false);
    assert.ok(result.error.includes("KitManifestSchema validation failed"));
  });
});

// ---------------------------------------------------------------------------
// assertTierFilesExist
// ---------------------------------------------------------------------------

describe("assertTierFilesExist", () => {
  it("passes when all tier files exist on disk", () => {
    const root = scratch();
    const kitDir = makeValidKitFixture(root);
    const manifestResult = mod.parseKitManifest(kitDir);
    assert.equal(manifestResult.ok, true);
    const tierResult = mod.assertTierFilesExist(kitDir, manifestResult.manifest);
    assert.equal(tierResult.ok, true);
  });

  it("fails and lists missing lib tier files", () => {
    const root = scratch();
    const kitDir = join(root, "missing-lib-kit");
    mkdirSync(kitDir, { recursive: true });
    // kit.json references lib/missing.ts but we don't create it
    writeFileSync(
      join(kitDir, "kit.json"),
      JSON.stringify({
        name: "missing-lib-kit",
        title: "T",
        domain: "agent-infra",
        summary: "s",
        compatibleBases: ["storage-app"],
        tiers: { lib: ["lib/missing.ts"] },
        requires: [],
        env: [],
        dependencies: {},
        devDependencies: {},
        composes: [],
        conflicts: [],
      }),
    );
    const manifestResult = mod.parseKitManifest(kitDir);
    assert.equal(manifestResult.ok, true);
    const tierResult = mod.assertTierFilesExist(kitDir, manifestResult.manifest);
    assert.equal(tierResult.ok, false, "Expected tier check to fail for missing file");
    assert.ok(
      tierResult.missing.some((m) => m.includes("missing.ts")),
      `Missing list should contain 'missing.ts', got: ${JSON.stringify(tierResult.missing)}`,
    );
  });

  it("fails and lists missing adapter tier files", () => {
    const root = scratch();
    const kitDir = join(root, "missing-adapter-kit");
    mkdirSync(kitDir, { recursive: true });
    writeFileSync(
      join(kitDir, "kit.json"),
      JSON.stringify({
        name: "missing-adapter-kit",
        title: "T",
        domain: "agent-infra",
        summary: "s",
        compatibleBases: ["mcp-agent"],
        tiers: {
          lib: [],
          adapters: { "mcp-agent": ["src/tools/absent.ts"] },
        },
        requires: [],
        env: [],
        dependencies: {},
        devDependencies: {},
        composes: [],
        conflicts: [],
      }),
    );
    const manifestResult = mod.parseKitManifest(kitDir);
    assert.equal(manifestResult.ok, true);
    const tierResult = mod.assertTierFilesExist(kitDir, manifestResult.manifest);
    assert.equal(tierResult.ok, false);
    assert.ok(
      tierResult.missing.some((m) => m.includes("absent.ts")),
      `Expected 'absent.ts' in missing list, got: ${JSON.stringify(tierResult.missing)}`,
    );
  });

  it("fails and lists missing ui tier files", () => {
    const root = scratch();
    const kitDir = join(root, "missing-ui-kit");
    mkdirSync(join(kitDir, "lib"), { recursive: true });
    writeFileSync(join(kitDir, "lib", "core.ts"), "// ok\n");
    writeFileSync(
      join(kitDir, "kit.json"),
      JSON.stringify({
        name: "missing-ui-kit",
        title: "T",
        domain: "agent-infra",
        summary: "s",
        compatibleBases: ["react-app"],
        tiers: {
          lib: ["lib/core.ts"],
          ui: ["components/MissingPanel.tsx"],
        },
        requires: [],
        env: [],
        dependencies: {},
        devDependencies: {},
        composes: [],
        conflicts: [],
      }),
    );
    const manifestResult = mod.parseKitManifest(kitDir);
    assert.equal(manifestResult.ok, true);
    const tierResult = mod.assertTierFilesExist(kitDir, manifestResult.manifest);
    assert.equal(tierResult.ok, false);
    assert.ok(
      tierResult.missing.some((m) => m.includes("MissingPanel.tsx")),
      `Expected 'MissingPanel.tsx' in missing list, got: ${JSON.stringify(tierResult.missing)}`,
    );
  });
});

// ---------------------------------------------------------------------------
// listKitDirs
// ---------------------------------------------------------------------------

describe("listKitDirs", () => {
  it("returns empty array for non-existent directory", () => {
    const dirs = mod.listKitDirs("/no/such/path/at/all");
    assert.deepEqual(dirs, []);
  });

  it("lists subdirectory names", () => {
    const root = scratch();
    mkdirSync(join(root, "kit-a"));
    mkdirSync(join(root, "kit-b"));
    writeFileSync(join(root, "not-a-dir.txt"), "");
    const dirs = mod.listKitDirs(root);
    assert.ok(dirs.includes("kit-a"), "Should include kit-a");
    assert.ok(dirs.includes("kit-b"), "Should include kit-b");
    assert.ok(!dirs.includes("not-a-dir.txt"), "Should not include files");
  });
});

// ---------------------------------------------------------------------------
// makeLocalFetchOverlay (structural + composition-aware)
// ---------------------------------------------------------------------------

describe("makeLocalFetchOverlay", () => {
  it("copies lib files to overlay tmpDir at their tier path (fallback for unknown kit name)", async () => {
    const root = scratch();
    const kitDir = makeValidKitFixture(root);
    const manifestResult = mod.parseKitManifest(kitDir);
    const manifest = manifestResult.manifest;

    const tmpDir = mkdtempSync(join(tmpdir(), "overlay-test-"));
    try {
      // "test-kit" does not exist in KITS_DIR so the fallback path is used.
      const overlay = mod.makeLocalFetchOverlay(kitDir, manifest);
      await overlay("test-kit", tmpDir);

      const libFile = join(tmpDir, "lib/agent-memory.ts");
      assert.ok(existsSync(libFile), `Expected ${libFile} to exist after overlay`);
    } finally {
      import("node:fs").then(({ rmSync }) =>
        rmSync(tmpDir, { recursive: true, force: true }),
      );
    }
  });

  it("resolves a DIFFERENT kit name to its own directory (composition-aware path)", async () => {
    // Set up two kit fixtures in a scratch root: kit-a and kit-b.
    // kit-a's overlay is passed as the fallback, but we call overlay("kit-b", tmpDir)
    // so the composition-aware path must read kit-b's own manifest and copy its lib.
    const root = scratch();

    // kit-a (the "fallback")
    const kitADir = join(root, "kit-a");
    mkdirSync(join(kitADir, "lib"), { recursive: true });
    writeFileSync(join(kitADir, "lib", "kit-a.ts"), "// kit-a lib\n");
    writeFileSync(
      join(kitADir, "kit.json"),
      JSON.stringify({
        name: "kit-a",
        title: "Kit A",
        domain: "agent-infra",
        summary: "Kit A.",
        compatibleBases: ["storage-app"],
        tiers: { lib: ["lib/kit-a.ts"] },
        requires: [],
        env: [],
        dependencies: {},
        devDependencies: {},
        composes: [],
        conflicts: [],
      }),
    );

    // kit-b (the composed dep to resolve by name)
    const kitBDir = join(root, "kit-b");
    mkdirSync(join(kitBDir, "lib"), { recursive: true });
    writeFileSync(join(kitBDir, "lib", "kit-b.ts"), "// kit-b lib\n");
    writeFileSync(
      join(kitBDir, "kit.json"),
      JSON.stringify({
        name: "kit-b",
        title: "Kit B",
        domain: "agent-infra",
        summary: "Kit B.",
        compatibleBases: ["storage-app"],
        tiers: { lib: ["lib/kit-b.ts"] },
        requires: [],
        env: [],
        dependencies: {},
        devDependencies: {},
        composes: [],
        conflicts: [],
      }),
    );

    const kitAManifest = mod.parseKitManifest(kitADir).manifest;
    const tmpDir = mkdtempSync(join(tmpdir(), "overlay-comp-test-"));
    try {
      // Use root as kitsDir so kit-b is resolvable by name
      const overlay = mod.makeLocalFetchOverlay(kitADir, kitAManifest, root);
      // Call with "kit-b" — composition-aware path resolves root/kit-b
      await overlay("kit-b", tmpDir);

      // kit-b's lib file must be written (NOT kit-a's)
      const kitBFile = join(tmpDir, "lib/kit-b.ts");
      assert.ok(existsSync(kitBFile), `Expected kit-b.ts to exist in overlay`);

      // kit-a's lib file must NOT be written
      const kitAFile = join(tmpDir, "lib/kit-a.ts");
      assert.ok(!existsSync(kitAFile), `kit-a.ts should NOT be in overlay when resolving kit-b`);
    } finally {
      import("node:fs").then(({ rmSync }) =>
        rmSync(tmpDir, { recursive: true, force: true }),
      );
    }
  });
});
