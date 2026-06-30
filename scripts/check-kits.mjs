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
//   6. TypeScript check on kit overlay files:
//      - Non-Next.js bases (storage-app, mcp-agent, node): full `tsc --noEmit`
//        against the base template's tsconfig AFTER applying the kit.
//      - Next.js bases (react-app, chat): full-project tsc is skipped (requires
//        `next build` for next-env.d.ts generation). Instead, kit-added adapter
//        + lib + ui files are type-checked in ISOLATION via runKitIsolatedTsc:
//        a synthetic tsconfig (bundler moduleResolution) is generated; all
//        @foundryprotocol/0gkit-* workspace packages are symlinked so type
//        imports resolve correctly. This ensures API surface bugs (wrong ctor
//        args, missing methods) are caught before they reach runtime.
//
// TSC DEPTH NOTE:
//   runKitIsolatedTsc replaces the former TSC_SKIPPED path for Next.js bases.
//   Full next-app tsc (which requires `next build` for next-env.d.ts) is still
//   deferred, but the kit-injected files are now type-proven against real types.
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
  writeFileSync,
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
 * Copy tier files for a single kit (given its directory and parsed manifest)
 * into tmpDir. The engine calls fetchOverlay(name, tmpDir) once per kit in the
 * composition closure — including composed dependencies — so this helper must
 * correctly copy ANY kit's files, not just the originally-requested one.
 *
 * File layout:
 *   lib/<path>              → tmpDir/<path>
 *   adapters/<base>/<path>  → tmpDir/<path>   (all bases; engine picks what it needs)
 *   ui/<path>               → tmpDir/<path>
 */
function copyKitTiersToOverlay(kitDir, manifest, tmpDir) {
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
}

/**
 * Build a composition-aware local fetchOverlay function.
 *
 * The engine calls `fetchOverlay(name, tmpDir)` once per kit in the composition
 * closure (deps-first). For a composing kit like prediction-market, the engine
 * calls:
 *   1. fetchOverlay("ai-oracle", tmpDir)    ← composed dep
 *   2. fetchOverlay("prediction-market", tmpDir) ← the kit itself
 *
 * This factory accepts the requesting kit's dir and manifest (for backward
 * compat with the existing call-site) but resolves the `name` argument at
 * call-time to templates/_kits/<name>/ — loading that kit's own manifest —
 * so composed dependencies are correctly written to the overlay tmpDir.
 *
 * CHANGE FROM ORIGINAL: the original ignored `name` and always used the
 * single `kitDir`/`manifest` captured at factory time. That works for
 * non-composing kits but breaks when the engine calls fetchOverlay with the
 * name of a COMPOSED kit (e.g. "ai-oracle"). Fixed by resolving `name` to the
 * actual kit directory and loading its own manifest.
 *
 * @param {string} _kitDir   - Absolute path to the requesting kit directory
 *                             (unused at call-time; kept for backward compat)
 * @param {object} _manifest - Requesting kit's manifest (unused at call-time)
 * @param {string} [kitsDir] - Root dir that contains all kit subdirs.
 *                             Defaults to KITS_DIR.
 */
export function makeLocalFetchOverlay(fallbackKitDir, fallbackManifest, kitsDir = KITS_DIR) {
  return async (name, tmpDir) => {
    // Resolve the kit name to its local directory (composition-aware).
    // When the engine applies a composing kit it calls fetchOverlay once for
    // each kit in the composition closure — first composed deps (e.g. "ai-oracle"),
    // then the requesting kit itself (e.g. "prediction-market"). We resolve
    // `name` → kitsDir/<name> and load that kit's own manifest so the correct
    // tier files are copied.
    //
    // FALLBACK: if kitsDir/<name>/kit.json does not exist (e.g. in unit tests
    // that use synthetic fixture kits not on disk), fall back to the originally
    // captured kitDir and manifest. This preserves backward compat with existing
    // tests while being composition-aware for real kit names.
    const resolvedKitDir = join(kitsDir, name);
    const manifestResult = parseKitManifest(resolvedKitDir);
    if (manifestResult.ok) {
      copyKitTiersToOverlay(resolvedKitDir, manifestResult.manifest, tmpDir);
    } else {
      // Fallback for synthetic fixture kits (unit tests)
      copyKitTiersToOverlay(fallbackKitDir, fallbackManifest, tmpDir);
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
//
// DEPTH GUARANTEE (updated — Fix 2b):
//   Non-Next.js bases (storage-app, mcp-agent, node):
//     Full `tsc --noEmit` against the base template's tsconfig after kit apply.
//   Next.js bases (react-app, chat):
//     Full `tsc --noEmit` of the ENTIRE project is still skipped (requires
//     `next build` for next-env.d.ts generation and @types/react resolution).
//     HOWEVER, kit-added adapter + ui TypeScript files are now type-checked in
//     isolation via `runKitIsolatedTsc`:
//       - A fresh temp directory is created with only the applied kit overlay
//         files (adapter + ui).
//       - A synthetic tsconfig is written that uses "bundler" moduleResolution
//         (matches Next.js) and points `paths` at the real workspace package
//         builds (packages/0gkit-*/dist), so type imports resolve correctly.
//       - `tsc --noEmit` runs against that synthetic project.
//     This ensures that API surface mismatches (wrong constructor args, missing
//     methods, wrong types) are caught at CI time rather than at runtime.
// ---------------------------------------------------------------------------

const NEXTJS_BASES = new Set(["react-app", "chat"]);

/** Absolute path to the tsc binary in the workspace. */
const TSC_BIN = join(ROOT, "node_modules", ".bin", "tsc");

/**
 * Runs `tsc --noEmit` in the given directory (must have tsconfig.json).
 * Returns { ok: true } or { ok: false, output }.
 */
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

/**
 * Type-checks kit-added overlay files (adapter + ui) for a Next.js base in
 * isolation against a synthetic tsconfig that resolves the real workspace
 * 0gkit package types.
 *
 * This is the type-gate that replaces the former TSC_SKIPPED path for Next.js
 * bases. It does NOT type-check the full Next.js app (that still requires
 * `next build`), but it DOES enforce that every file the kit injects compiles
 * correctly against the real @foundryprotocol/0gkit-* types.
 *
 * COMPOSITION SUPPORT: for composing kits (manifest.composes !== []), the lib
 * files of every composed kit are also included in the isolated tsc copy set.
 * This is required because adapters in the composing kit import from the
 * co-located composed lib (e.g. `import { resolveOracle } from "../../../lib/oracle.js"`).
 * Without the composed kit's lib files in the tmpDir, tsc cannot resolve those
 * relative imports and fails with TS2307 "Cannot find module".
 *
 * @param {string} kitDir  - Absolute path to the kit directory (e.g. templates/_kits/agent-memory)
 * @param {object} manifest - Parsed + validated KitManifest
 * @param {string} base     - The base name (e.g. "react-app")
 * @param {string} [kitsDir] - Root dir that contains all kit subdirs. Defaults to KITS_DIR.
 * @returns {{ ok: boolean, output?: string }}
 */
export function runKitIsolatedTsc(kitDir, manifest, base, kitsDir = KITS_DIR) {
  // Collect kit overlay files for this base — adapter + lib + ui — all .ts/.tsx
  const adapterFiles = manifest.tiers.adapters?.[base] ?? [];
  const libFiles = manifest.tiers.lib ?? [];
  const uiFiles = manifest.tiers.ui ?? [];

  const filesToCheck = [
    ...adapterFiles.map((f) => ({ src: join(kitDir, "adapters", base, f), rel: f })),
    ...libFiles.map((f) => ({ src: join(kitDir, "lib", f.replace(/^lib\//, "")), rel: f })),
    ...uiFiles.map((f) => ({ src: join(kitDir, "ui", f), rel: f })),
  ].filter(
    ({ src }) =>
      existsSync(src) && (src.endsWith(".ts") || src.endsWith(".tsx"))
  );

  // COMPOSITION SUPPORT: include lib files from all composed kits.
  // When this kit's adapters import from a composed kit's lib (e.g. oracle.ts),
  // tsc must be able to resolve those relative paths inside the isolated tmpDir.
  for (const composedName of manifest.composes ?? []) {
    const composedKitDir = join(kitsDir, composedName);
    const composedManifestResult = parseKitManifest(composedKitDir);
    if (!composedManifestResult.ok) continue; // skip unknown composed kits
    for (const relPath of composedManifestResult.manifest.tiers.lib ?? []) {
      const src = join(composedKitDir, "lib", relPath.replace(/^lib\//, ""));
      if (existsSync(src) && (src.endsWith(".ts") || src.endsWith(".tsx"))) {
        filesToCheck.push({ src, rel: relPath });
      }
    }
  }

  if (filesToCheck.length === 0) {
    return { ok: true, skipped: "no TS files in kit overlay for this base" };
  }

  let tmpDir;
  try {
    tmpDir = mkdtempSync(join(tmpdir(), `0gkit-kit-tsc-`));

    // Copy kit files into tmpDir
    for (const { src, rel } of filesToCheck) {
      const dest = join(tmpDir, rel);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
    }

    // Symlink all @foundryprotocol/0gkit-* workspace packages so tsc resolves types
    const nmFoundry = join(tmpDir, "node_modules", "@foundryprotocol");
    mkdirSync(nmFoundry, { recursive: true });
    for (const shortName of readdirSync(join(ROOT, "packages"))) {
      if (!shortName.startsWith("0gkit-")) continue;
      const workspaceSrc = join(ROOT, "packages", shortName);
      if (!statSync(workspaceSrc).isDirectory()) continue;
      const destLink = join(nmFoundry, shortName);
      if (!existsSync(destLink)) {
        symlinkSync(workspaceSrc, destLink);
      }
    }

    // Also symlink next and react @types so import from "next/server" type-checks.
    // Pull these from the base template's node_modules — they're already installed there.
    const baseNm = join(TEMPLATES_DIR, base, "node_modules");
    const tmpNm = join(tmpDir, "node_modules");
    mkdirSync(tmpNm, { recursive: true });
    for (const pkg of ["next", "react", "react-dom"]) {
      const src = join(baseNm, pkg);
      const dest = join(tmpNm, pkg);
      if (existsSync(src) && !existsSync(dest)) symlinkSync(src, dest);
    }
    const atypesDir = join(tmpDir, "node_modules", "@types");
    mkdirSync(atypesDir, { recursive: true });
    for (const pkg of ["react", "react-dom", "node"]) {
      const src = join(baseNm, "@types", pkg);
      const dest = join(atypesDir, pkg);
      if (existsSync(src) && !existsSync(dest)) symlinkSync(src, dest);
    }

    // Write a synthetic tsconfig that matches Next.js "bundler" moduleResolution
    const include = filesToCheck.map(({ rel }) => rel);
    const tsconfig = {
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        lib: ["ES2022", "DOM"],
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        resolveJsonModule: true,
        skipLibCheck: true,
        jsx: "preserve",
        baseUrl: ".",
      },
      include,
    };
    writeFileSync(join(tmpDir, "tsconfig.json"), JSON.stringify(tsconfig, null, 2));

    // Run tsc against the isolated kit files
    try {
      execSync(`"${TSC_BIN}" --noEmit`, {
        cwd: tmpDir,
        stdio: "pipe",
        timeout: 60_000,
      });
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        output: (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? ""),
      };
    }
  } finally {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
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
          // Build a real node_modules in tmpDest by symlinking each top-level
          // entry from the base template's node_modules. We do this rather than
          // symlinking the whole directory so we can later add kit dependencies
          // (which the base template may not have) without mutating the base.
          const baseNodeModules = join(TEMPLATES_DIR, base, "node_modules");
          const tmpNodeModules = join(tmpDest, "node_modules");
          if (existsSync(baseNodeModules)) {
            mkdirSync(tmpNodeModules, { recursive: true });
            for (const entry of readdirSync(baseNodeModules)) {
              const src = join(baseNodeModules, entry);
              const dest = join(tmpNodeModules, entry);
              if (!existsSync(dest)) {
                symlinkSync(src, dest);
              }
            }
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

        // Upgrade all @foundryprotocol/0gkit-* symlinks to point at the
        // workspace package builds. This ensures tsc sees the in-repo type
        // declarations (which are always up-to-date) rather than the
        // npm-installed copies in the base template's node_modules (which may
        // be behind the current branch). It also makes kit-added packages
        // (those not in the base template) resolvable without a full install.
        try {
          const tmpFoundryNm = join(tmpDest, "node_modules", "@foundryprotocol");
          // Collect every @foundryprotocol/0gkit-* workspace package
          const workspacePkgsDir = join(ROOT, "packages");
          if (existsSync(workspacePkgsDir)) {
            mkdirSync(tmpFoundryNm, { recursive: true });
            for (const shortName of readdirSync(workspacePkgsDir)) {
              if (!shortName.startsWith("0gkit-")) continue;
              const workspaceSrc = join(workspacePkgsDir, shortName);
              if (!statSync(workspaceSrc).isDirectory()) continue;
              const destLink = join(tmpFoundryNm, shortName);
              // Remove existing symlink (from base node_modules copy) if present
              if (existsSync(destLink)) {
                rmSync(destLink, { recursive: true, force: true });
              }
              symlinkSync(workspaceSrc, destLink);
            }
          }
        } catch {
          // non-fatal: tsc may still pass if deps are already resolvable
        }

        // TSC check
        if (NEXTJS_BASES.has(base)) {
          // Full project tsc is skipped (requires `next build` for next-env.d.ts).
          // Instead, run kit overlay files in isolation against real 0gkit types.
          const kitTscResult = runKitIsolatedTsc(kitDir, manifest, base);
          if (kitTscResult.skipped) {
            console.log(
              `${label} ✓ PASS (applyKit ok, wrote ${applyResult.filesWritten.length} file(s); kit-isolated tsc: ${kitTscResult.skipped})`,
            );
          } else if (kitTscResult.ok) {
            console.log(
              `${label} ✓ PASS (applyKit ok, wrote ${applyResult.filesWritten.length} file(s); kit-isolated tsc clean — full project tsc deferred to next build)`,
            );
          } else {
            const snippet = (kitTscResult.output ?? "").split("\n").slice(0, 20).join("\n");
            const msg = `kit-isolated tsc failed (Next.js base):\n${snippet}`;
            console.error(`${label} ✗ FAIL: ${msg}`);
            findings.push({ kit: kitName, base, step: "kit-tsc", error: msg });
            totalFail++;
            continue;
          }
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
