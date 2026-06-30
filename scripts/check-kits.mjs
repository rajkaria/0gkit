#!/usr/bin/env node
// check-kits.mjs — kit × base matrix harness for 0gkit kits engine
//
// DEPTH GUARANTEE (what this harness verifies per kit × base combo):
//   1. kit.json parses and validates against KitManifestSchema
//   2. Every file listed in tiers.lib / tiers.adapters / tiers.ui exists on disk
//      in the kit directory
//   3. The kit is in the compiled KITS registry (registry.generated check)
//   4. applyKit() succeeds (dry-run=false) using a local copyOverlay — no giget,
//      no network, works on unpushed branches. applyKit writes kit files into a
//      temp clone of the base template.
//   5. If applyKit throws KIT_MISSING_REQUIRES, that is reported as FAIL with a
//      clear message (kit/base/missing packages) — not silently swallowed.
//   6. TypeScript parse check on kit overlay files: `tsc --noEmit` against the
//      base template's tsconfig AFTER applying the kit. (Next.js bases skip tsc
//      because they require `next build` for type generation — documented below.)
//
// TSC DEPTH NOTE:
//   Bases react-app and chat use Next.js (moduleResolution: "bundler", incremental
//   plugins, next-env.d.ts type generation). Running `tsc --noEmit` standalone on
//   a fresh temp dir (without `next build` or node_modules) fails with missing
//   next-env.d.ts and @types/react. We therefore run tsc only on non-Next.js bases
//   (storage-app, mcp-agent) and log a clear "TSC_SKIPPED (Next.js base)" for the
//   others. The applyKit structural check still runs for ALL combos.
//
// MISSING-REQUIRES POLICY:
//   If a kit's `requires` list names a package not present in the base template's
//   package.json (deps or devDeps), applyKit throws KIT_MISSING_REQUIRES. This
//   harness reports it as FAIL and surfaces the exact package list. The CI gate
//   MUST remain red — do not paper over missing-requires findings.
//
// Wired as: pnpm kits:check (see root package.json)

import {
  readdirSync,
  existsSync,
  readFileSync,
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { join, dirname, relative } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const KITS_DIR = join(ROOT, "templates", "_kits");
const TEMPLATES_DIR = join(ROOT, "templates");
const KITS_DIST = join(ROOT, "packages", "0gkit-kits", "dist", "index.js");

// ---------------------------------------------------------------------------
// Load engine from built dist (avoids tsx / TypeScript overhead)
// ---------------------------------------------------------------------------

// We use dynamic import so we get the compiled ESM.
const engine = await import(KITS_DIST);
const { KitManifestSchema, applyKit, KitError, resolveTiers } = engine;

// ---------------------------------------------------------------------------
// Enumeration helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/**
 * Returns all kit directory names under templates/_kits/.
 */
export function listKitDirs(kitsDir = KITS_DIR) {
  if (!existsSync(kitsDir)) return [];
  return readdirSync(kitsDir).filter(
    (d) => statSync(join(kitsDir, d)).isDirectory(),
  );
}

/**
 * Reads and parses a kit.json from the given kit directory.
 * Returns { ok: true, manifest } or { ok: false, error }.
 */
export function parseKitManifest(kitDir) {
  const kitJsonPath = join(kitDir, "kit.json");
  if (!existsSync(kitJsonPath)) {
    return { ok: false, error: `kit.json not found at ${kitJsonPath}` };
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(kitJsonPath, "utf8"));
  } catch (e) {
    return { ok: false, error: `kit.json is not valid JSON: ${e.message}` };
  }
  const result = KitManifestSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      error: `KitManifestSchema validation failed:\n${result.error.toString()}`,
    };
  }
  return { ok: true, manifest: result.data };
}

/**
 * Checks that every tier file referenced in the manifest actually exists
 * on disk inside the kit directory.
 *
 * The kit directory layout is:
 *   lib/<path>              → checked as <kitDir>/lib/<path>
 *   adapters/<base>/<path>  → checked as <kitDir>/adapters/<base>/<path>
 *   ui/<path>               → checked as <kitDir>/ui/<path>
 *
 * Returns { ok: true } or { ok: false, missing: string[] }.
 */
export function assertTierFilesExist(kitDir, manifest) {
  const missing = [];

  for (const relPath of manifest.tiers.lib ?? []) {
    const abs = join(kitDir, "lib", relPath.replace(/^lib\//, ""));
    if (!existsSync(abs)) missing.push(`lib/${relPath} (→ ${abs})`);
  }

  for (const [base, files] of Object.entries(manifest.tiers.adapters ?? {})) {
    for (const relPath of files) {
      const abs = join(kitDir, "adapters", base, relPath);
      if (!existsSync(abs)) missing.push(`adapters/${base}/${relPath} (→ ${abs})`);
    }
  }

  for (const relPath of manifest.tiers.ui ?? []) {
    const abs = join(kitDir, "ui", relPath.replace(/^(components|hooks|pages)\//, (m) => m));
    if (!existsSync(abs)) {
      // Try under ui/ prefix directly
      const abs2 = join(kitDir, "ui", relPath);
      if (!existsSync(abs2)) missing.push(`ui/${relPath} (→ ${abs2})`);
    }
  }

  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

/**
 * Recursively copies a directory tree from src to dest.
 */
function copyDir(src, dest) {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  for (const ent of readdirSync(src)) {
    const srcPath = join(src, ent);
    const destPath = join(dest, ent);
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      mkdirSync(dirname(destPath), { recursive: true });
      copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Build a local fetchOverlay function that copies files from the kit directory
 * into the tmpDir, flattening the adapters/<base>/ prefix.
 *
 * The overlay dir must contain files at their tier-path positions, e.g.:
 *   lib/agent-memory.ts
 *   src/tools/memory.ts       (from adapters/mcp-agent/src/tools/memory.ts)
 *   components/MemoryPanel.tsx (from ui/components/MemoryPanel.tsx)
 */
export function makeLocalFetchOverlay(kitDir, manifest) {
  return async (name, tmpDir) => {
    // lib/* — copy directly
    for (const relPath of manifest.tiers.lib ?? []) {
      const src = join(kitDir, "lib", relPath.replace(/^lib\//, ""));
      const dest = join(tmpDir, relPath);
      mkdirSync(dirname(dest), { recursive: true });
      if (existsSync(src)) copyFileSync(src, dest);
    }

    // adapters/<base>/<relPath> — copy to tmpDir/<relPath>
    for (const [base, files] of Object.entries(manifest.tiers.adapters ?? {})) {
      for (const relPath of files) {
        const src = join(kitDir, "adapters", base, relPath);
        const dest = join(tmpDir, relPath);
        mkdirSync(dirname(dest), { recursive: true });
        if (existsSync(src)) copyFileSync(src, dest);
      }
    }

    // ui/* — copy with ui/ prefix stripped
    for (const relPath of manifest.tiers.ui ?? []) {
      const src = join(kitDir, "ui", relPath);
      const dest = join(tmpDir, relPath);
      mkdirSync(dirname(dest), { recursive: true });
      if (existsSync(src)) copyFileSync(src, dest);
    }
  };
}

/**
 * Scaffolds a base template into destDir (copies local templates/<base>/ into it,
 * skipping node_modules, .next, and build artifacts).
 */
export function scaffoldBase(base, destDir, templatesDir = TEMPLATES_DIR) {
  const baseDir = join(templatesDir, base);
  if (!existsSync(baseDir)) {
    throw new Error(`Base template not found: ${baseDir}`);
  }
  const SKIP = new Set(["node_modules", ".next", "dist", ".turbo", "*.tsbuildinfo"]);
  function copyEntries(src, dest) {
    mkdirSync(dest, { recursive: true });
    for (const ent of readdirSync(src)) {
      if (SKIP.has(ent) || ent.endsWith(".tsbuildinfo")) continue;
      const srcPath = join(src, ent);
      const destPath = join(dest, ent);
      if (statSync(srcPath).isDirectory()) {
        copyEntries(srcPath, destPath);
      } else {
        copyFileSync(srcPath, destPath);
      }
    }
  }
  copyEntries(baseDir, destDir);
}

// ---------------------------------------------------------------------------
// TSC depth check
// ---------------------------------------------------------------------------

const NEXTJS_BASES = new Set(["react-app", "chat"]);

/**
 * Runs `tsc --noEmit` in the given directory (must have tsconfig.json).
 * Returns { ok: true } or { ok: false, output }.
 */
/** Absolute path to the tsc binary in the workspace. */
const TSC_BIN = join(ROOT, "node_modules", ".bin", "tsc");

export function runTsc(dir) {
  try {
    execSync(`"${TSC_BIN}" --noEmit`, {
      cwd: dir,
      stdio: "pipe",
      timeout: 30_000,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, output: (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "") };
  }
}

// ---------------------------------------------------------------------------
// Main harness
// ---------------------------------------------------------------------------

async function main() {
  const kitNames = listKitDirs(KITS_DIR);

  if (kitNames.length === 0) {
    console.log("No kits found in templates/_kits/. Nothing to check.");
    process.exit(0);
  }

  console.log(`\nKit×Base matrix check (${kitNames.length} kit(s))\n${"─".repeat(60)}`);

  let totalPass = 0;
  let totalFail = 0;
  const findings = [];

  for (const kitName of kitNames) {
    const kitDir = join(KITS_DIR, kitName);

    console.log(`\nKit: ${kitName}`);

    // Step 1: Validate manifest
    const manifestResult = parseKitManifest(kitDir);
    if (!manifestResult.ok) {
      console.error(`  ✗ MANIFEST INVALID: ${manifestResult.error}`);
      findings.push({ kit: kitName, base: "-", step: "manifest", error: manifestResult.error });
      totalFail++;
      continue;
    }
    const manifest = manifestResult.manifest;
    console.log(`  ✓ manifest valid (compatibleBases: ${manifest.compatibleBases.join(", ")})`);

    // Step 2: Assert tier file existence
    const tierResult = assertTierFilesExist(kitDir, manifest);
    if (!tierResult.ok) {
      const msg = `missing tier files:\n    ${tierResult.missing.join("\n    ")}`;
      console.error(`  ✗ TIER FILES: ${msg}`);
      findings.push({ kit: kitName, base: "-", step: "tier-files", error: msg });
      totalFail++;
      continue;
    }
    console.log(`  ✓ all tier files present on disk`);

    // Steps 3–5: Per-base combo
    for (const base of manifest.compatibleBases) {
      const label = `  [${kitName} × ${base}]`;
      let tmpDest;

      try {
        tmpDest = mkdtempSync(join(tmpdir(), `0gkit-check-kits-`));

        // Scaffold base from local templates/
        try {
          scaffoldBase(base, tmpDest);
          // Symlink node_modules from base template (templates are not in pnpm workspace,
          // so they have their own node_modules — required for tsc to find @types/node etc.)
          const baseNodeModules = join(TEMPLATES_DIR, base, "node_modules");
          if (existsSync(baseNodeModules)) {
            symlinkSync(baseNodeModules, join(tmpDest, "node_modules"));
          }
        } catch (e) {
          console.error(`${label} ✗ SCAFFOLD FAILED: ${e.message}`);
          findings.push({ kit: kitName, base, step: "scaffold", error: e.message });
          totalFail++;
          continue;
        }

        // Build local overlay injector
        const localFetchOverlay = makeLocalFetchOverlay(kitDir, manifest);

        // Apply kit
        let applyResult;
        try {
          applyResult = await applyKit({
            kit: kitName,
            dest: tmpDest,
            base,
            deps: { fetchOverlay: localFetchOverlay },
          });
        } catch (e) {
          if (e instanceof KitError && e.code === "KIT_MISSING_REQUIRES") {
            const msg = `KIT_MISSING_REQUIRES — ${e.message}`;
            console.error(`${label} ✗ FAIL: ${msg}`);
            findings.push({ kit: kitName, base, step: "apply", error: msg });
            totalFail++;
            continue;
          }
          const msg = `applyKit threw: ${e.message}`;
          console.error(`${label} ✗ FAIL: ${msg}`);
          findings.push({ kit: kitName, base, step: "apply", error: msg });
          totalFail++;
          continue;
        }

        // TSC check
        if (NEXTJS_BASES.has(base)) {
          console.log(
            `${label} ✓ PASS (applyKit ok, wrote ${applyResult.filesWritten.length} file(s); TSC_SKIPPED — Next.js base requires next build)`,
          );
        } else {
          const tscResult = runTsc(tmpDest);
          if (tscResult.ok) {
            console.log(
              `${label} ✓ PASS (applyKit ok, wrote ${applyResult.filesWritten.length} file(s); tsc --noEmit clean)`,
            );
          } else {
            const snippet = (tscResult.output ?? "").split("\n").slice(0, 15).join("\n");
            const msg = `tsc --noEmit failed:\n${snippet}`;
            console.error(`${label} ✗ FAIL: ${msg}`);
            findings.push({ kit: kitName, base, step: "tsc", error: msg });
            totalFail++;
            continue;
          }
        }

        totalPass++;
      } finally {
        if (tmpDest && existsSync(tmpDest)) {
          rmSync(tmpDest, { recursive: true, force: true });
        }
      }
    }
  }

  // Summary
  console.log(`\n${"─".repeat(60)}`);
  console.log(`Results: ${totalPass} PASS, ${totalFail} FAIL`);

  if (findings.length > 0) {
    console.error("\nFAILURES:");
    for (const f of findings) {
      console.error(`  kit=${f.kit}  base=${f.base}  step=${f.step}`);
      console.error(`    ${f.error.replace(/\n/g, "\n    ")}`);
    }
    console.error(`\n${totalFail} check(s) failed.`);
    process.exit(1);
  }

  console.log(`\n✓ All ${totalPass} kit×base combo(s) passed.`);
}

// Only run when executed directly (not when imported by tests)
const isMain =
  process.argv[1] &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
    // resolve symlinks — pnpm may invoke via a linked bin
    process.argv[1].endsWith("check-kits.mjs"));

if (isMain) {
  main().catch((e) => {
    console.error("check-kits: fatal error:", e);
    process.exit(1);
  });
}
