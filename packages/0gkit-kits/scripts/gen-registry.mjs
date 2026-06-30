// Build-time registry codegen.
// Scans templates/_kits/kit.json files, validates against KitManifestSchema
// (materialising all schema defaults), writes src/registry.generated.ts.
// Output is idempotent and deterministic (sorted by kit name).
//
// WHY schema-parse here (Fix 5):
//   Kit manifests are stored as concise JSON files that may omit optional
//   fields that have `.default()` values in the zod schema (e.g. composes:[],
//   conflicts:[], requires:[], tiers.lib:[]). If gen-registry embeds the raw
//   parsed JSON without applying the schema, a generated entry missing one of
//   those defaulted fields will crash applyKit at runtime (e.g. iterating
//   manifest.conflicts throws on undefined). Parsing through KitManifestSchema
//   before serialising guarantees every field the engine expects is present.
//
//   The schema is loaded from the pre-built dist/ of this package. Build order:
//     prebuild → gen-registry (runs this script) → tsup (compiles TS → dist)
//   Wait — that would be circular. Instead we load from the ALREADY-BUILT dist
//   when it exists, and fall back to a minimal inline-default function for the
//   first cold build (when dist/ hasn't been produced yet). The fallback is
//   intentionally conservative: it only applies the specific defaults that
//   KitManifestSchema defines (composes, conflicts, requires, env,
//   dependencies, devDependencies, tiers.lib), which are stable and low-churn.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");               // packages/0gkit-kits
const repoRoot = resolve(pkgRoot, "../..");             // repo root
const kitsDir = join(repoRoot, "templates", "_kits");
const outFile = join(pkgRoot, "src", "registry.generated.ts");
const distIndex = join(pkgRoot, "dist", "index.js");

// ---------------------------------------------------------------------------
// Schema loading
//
// Attempt to load KitManifestSchema from the already-built dist/. If dist/
// doesn't exist (first cold build), use the inline fallback that materialises
// the same defaults the zod schema would.
// ---------------------------------------------------------------------------

let schemaParser;

if (existsSync(distIndex)) {
  try {
    const mod = await import(distIndex);
    if (mod.KitManifestSchema && typeof mod.KitManifestSchema.parse === "function") {
      schemaParser = (raw) => mod.KitManifestSchema.parse(raw);
      console.log("[gen-registry] using KitManifestSchema.parse from dist/");
    }
  } catch {
    // dist exists but failed to import (e.g. stale build) — fall through
  }
}

if (!schemaParser) {
  // Inline fallback: apply the same defaults as KitManifestSchema so that
  // the generated file is correct even on a cold build (before dist/ exists).
  // IMPORTANT: keep in sync with src/manifest.ts default() calls.
  schemaParser = (raw) => {
    if (typeof raw !== "object" || raw === null) {
      throw new Error(`manifest must be a JSON object`);
    }
    if (!raw.name || typeof raw.name !== "string") {
      throw new Error(`"name" must be a non-empty string`);
    }
    return {
      ...raw,
      tiers: {
        lib: [],
        ...(raw.tiers ?? {}),
      },
      env: raw.env ?? [],
      dependencies: raw.dependencies ?? {},
      devDependencies: raw.devDependencies ?? {},
      requires: raw.requires ?? [],
      composes: raw.composes ?? [],
      conflicts: raw.conflicts ?? [],
    };
  };
  console.log("[gen-registry] dist/ not available — using inline default materialiser (cold build)");
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

let kitDirs;
try {
  kitDirs = readdirSync(kitsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
} catch {
  // Directory doesn't exist yet — treat as empty
  kitDirs = [];
}

const manifests = [];

for (const kitName of kitDirs) {
  const manifestPath = join(kitsDir, kitName, "kit.json");
  let raw;
  try {
    raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (err) {
    throw new Error(`Failed to read ${manifestPath}: ${err.message}`);
  }
  // Apply schema (materialises defaults). Throws on invalid manifests.
  let parsed;
  try {
    parsed = schemaParser(raw);
  } catch (err) {
    throw new Error(`KitManifestSchema.parse failed for ${manifestPath}: ${err.message}`);
  }
  manifests.push(parsed);
}

// Sort deterministically by name (already sorted from readdirSync, but be explicit)
manifests.sort((a, b) => a.name.localeCompare(b.name));

// ---------------------------------------------------------------------------
// Codegen
// ---------------------------------------------------------------------------

const kitsJson = JSON.stringify(manifests, null, 2);

const output = `// AUTO-GENERATED by scripts/gen-registry.mjs — DO NOT EDIT BY HAND
// Regenerated on every build via the "prebuild" / "pretest" npm script.
import type { KitManifest } from "./manifest.js";

export const KITS: KitManifest[] = ${kitsJson};
`;

writeFileSync(outFile, output, "utf8");

const count = manifests.length;
console.log(
  `[gen-registry] wrote ${outFile.replace(process.cwd(), ".")} — ${count} kit${count === 1 ? "" : "s"}`,
);
