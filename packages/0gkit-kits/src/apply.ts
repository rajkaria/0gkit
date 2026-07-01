import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import type { KitManifest } from "./manifest.js";
import { getKit, resolveTiers, resolveTierFiles } from "./registry.js";
import { fetchKitOverlay } from "./fetch.js";
import { mergePackageJson, appendEnv } from "./merge.js";
import { KITS } from "./registry.generated.js";

// ---------------------------------------------------------------------------
// KitError
// ---------------------------------------------------------------------------

export type KitErrorCode =
  | "KIT_NOT_FOUND"
  | "KIT_CONFLICT"
  | "KIT_MISSING_REQUIRES"
  | "KIT_INCOMPATIBLE";

export class KitError extends Error {
  readonly code: KitErrorCode;

  constructor(code: KitErrorCode, message: string) {
    super(message);
    this.name = "KitError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// ApplyResult
// ---------------------------------------------------------------------------

export interface ApplyResult {
  applied: string[];
  filesWritten: string[];
  envAdded: string[];
  notes: string[];
  token: "[0gkit:kit-applied]";
}

// ---------------------------------------------------------------------------
// ApplyDeps (injectable for testing)
// ---------------------------------------------------------------------------

export interface ApplyDeps {
  fetchOverlay?: (name: string, dir: string) => Promise<void>;
  registry?: KitManifest[];
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ApplyKitOptions {
  kit: string;
  dest: string;
  base: string;
  pm?: string;
  dryRun?: boolean;
  deps?: ApplyDeps;
  /** Injectable clock — defaults to `() => new Date().toISOString()`. Override in tests for determinism. */
  now?: () => string;
}

// ---------------------------------------------------------------------------
// Composition resolution helpers
// ---------------------------------------------------------------------------

/**
 * Walks the composes[] graph depth-first (DFS), building a topological order
 * where composed dependencies come BEFORE the kit that composes them.
 *
 * Deduplicates by name — each kit appears exactly once.
 * Unknown kit names throw KitError("KIT_NOT_FOUND").
 */
function resolveCompositionClosure(
  kitName: string,
  registry: KitManifest[],
  visited: Set<string> = new Set(),
  result: KitManifest[] = []
): KitManifest[] {
  // Skip already-processed kits (dedup)
  if (visited.has(kitName)) return result;

  const manifest = getKit(kitName, registry);
  if (!manifest) {
    throw new KitError("KIT_NOT_FOUND", `Kit "${kitName}" not found in registry.`);
  }

  // Mark as visited early to handle potential circular references gracefully
  visited.add(kitName);

  // Depth-first: process composed dependencies first
  for (const composedName of manifest.composes) {
    resolveCompositionClosure(composedName, registry, visited, result);
  }

  // Push self after all dependencies
  result.push(manifest);

  return result;
}

// ---------------------------------------------------------------------------
// applyKit
// ---------------------------------------------------------------------------

export async function applyKit(opts: ApplyKitOptions): Promise<ApplyResult> {
  const {
    kit: kitName,
    dest,
    base,
    dryRun = false,
    deps = {},
    now = () => new Date().toISOString(),
  } = opts;

  const {
    fetchOverlay = fetchKitOverlay as (name: string, dir: string) => Promise<void>,
    registry = KITS,
  } = deps;

  // 1. Resolve full composition closure (depth-first, deps-first ordering)
  const resolved = resolveCompositionClosure(kitName, registry);

  // 2. Conflict check across the resolved set
  //    For each kit in the resolved set, if any other kit's name appears in
  //    its conflicts[], we have a conflict.
  const resolvedNames = new Set(resolved.map((k) => k.name));
  for (const manifest of resolved) {
    for (const conflictName of manifest.conflicts) {
      if (resolvedNames.has(conflictName)) {
        throw new KitError(
          "KIT_CONFLICT",
          `Kit "${manifest.name}" conflicts with "${conflictName}" — both are in the apply set.`
        );
      }
    }
  }

  // 3. Top-level kit compatibility check
  //    If the explicitly-requested kit resolves to zero tier files for `base`, throw.
  const topLevelManifest = getKit(kitName, registry)!;
  const topLevelTierFiles = resolveTiers(topLevelManifest, base);
  if (topLevelTierFiles.length === 0) {
    throw new KitError(
      "KIT_INCOMPATIBLE",
      `Kit "${kitName}" has no files for base "${base}".`
    );
  }

  // 4. Read dest/package.json
  const pkgJsonPath = join(dest, "package.json");
  let destPkg: Record<string, unknown> = {};
  if (existsSync(pkgJsonPath)) {
    try {
      destPkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as Record<
        string,
        unknown
      >;
    } catch {
      // ignore parse errors — treat as empty
    }
  }

  // 5. Missing-requires check across ALL kits in the resolved set
  //    For each require, check if @foundryprotocol/<req> or <req> is in deps/devDeps.
  const destDeps = (destPkg["dependencies"] ?? {}) as Record<string, string>;
  const destDevDeps = (destPkg["devDependencies"] ?? {}) as Record<string, string>;
  const allDestDeps = { ...destDeps, ...destDevDeps };

  for (const manifest of resolved) {
    const missingPkgs: string[] = [];
    for (const req of manifest.requires) {
      const scoped = `@foundryprotocol/${req}`;
      if (!(req in allDestDeps) && !(scoped in allDestDeps)) {
        missingPkgs.push(scoped);
      }
    }
    if (missingPkgs.length > 0) {
      throw new KitError(
        "KIT_MISSING_REQUIRES",
        `Kit "${manifest.name}" requires packages not present in dest: ${missingPkgs.join(", ")}`
      );
    }
  }

  // 6. Apply each kit in resolved order
  const appliedNames: string[] = [];
  const filesWritten: string[] = [];
  const envAdded: string[] = [];
  const notes: string[] = [];

  // Read current .env.example content (for idempotency tracking)
  const envExamplePath = join(dest, ".env.example");
  let currentEnvContent = existsSync(envExamplePath)
    ? readFileSync(envExamplePath, "utf8")
    : "";

  // Working copy of package.json for merging
  let workingPkg = { ...destPkg } as Record<string, unknown>;

  for (const manifest of resolved) {
    // Each tier file carries its overlay `src` (tier-prefixed) and project
    // `dest` — they differ for the `adapters`/`ui` tiers (see resolveTierFiles).
    const tierFiles = resolveTierFiles(manifest, base);

    // Record kit as applied
    appliedNames.push(manifest.name);

    if (dryRun) {
      // In dry-run: just record what WOULD be written
      filesWritten.push(...tierFiles.map((f) => f.dest));
    } else {
      // Fetch overlay into a temp directory
      const tmpDir = mkdtempSync(join(tmpdir(), `0gkit-kit-${manifest.name}-`));

      try {
        await fetchOverlay(manifest.name, tmpDir);

        // Copy each tier file from its overlay src -> its project dest.
        for (const { src, dest: relDest } of tierFiles) {
          const srcPath = join(tmpDir, src);
          const dstPath = join(dest, relDest);

          // Create parent directories if needed
          mkdirSync(dirname(dstPath), { recursive: true });

          // Copy (force-overwrite)
          copyFileSync(srcPath, dstPath);
          filesWritten.push(relDest);
        }
      } finally {
        // Clean up temp dir
        rmSync(tmpDir, { recursive: true, force: true });
      }
    }

    // Merge package.json deps (base wins — existing versions never downgraded)
    workingPkg = mergePackageJson(
      workingPkg as Parameters<typeof mergePackageJson>[0],
      {
        dependencies: manifest.dependencies as Record<string, string>,
        devDependencies: manifest.devDependencies as Record<string, string>,
      }
    ) as Record<string, unknown>;

    // Compute env vars to add (check against current content for idempotency)
    const beforeEnv = currentEnvContent;
    currentEnvContent = appendEnv(currentEnvContent, manifest.env);
    // Track which keys were actually appended
    for (const { key } of manifest.env) {
      const pattern = new RegExp(`^${key}=`, "m");
      if (!pattern.test(beforeEnv) && pattern.test(currentEnvContent)) {
        envAdded.push(key);
      }
    }
  }

  if (dryRun) {
    notes.push(
      `dry-run: would apply [${appliedNames.join(", ")}] and write ${filesWritten.length} file(s) — no changes made.`
    );
  } else {
    // Write back the merged package.json
    writeFileSync(pkgJsonPath, JSON.stringify(workingPkg, null, 2) + "\n", "utf8");

    // Write .env.example (only if there's content to write)
    if (currentEnvContent.length > 0) {
      writeFileSync(envExamplePath, currentEnvContent, "utf8");
    }

    // Write .0gkit/kits.json — union-merge with any existing manifest
    const manifestDir = join(dest, ".0gkit");
    const manifestPath = join(manifestDir, "kits.json");

    let existingApplied: string[] = [];
    if (existsSync(manifestPath)) {
      try {
        const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          "applied" in parsed &&
          Array.isArray((parsed as Record<string, unknown>)["applied"])
        ) {
          existingApplied = (parsed as { applied: string[] }).applied;
        }
      } catch {
        // ignore parse errors — treat as empty
      }
    }

    // Union: preserve first-seen order from existing, append any new names
    const unionApplied = [...existingApplied];
    for (const name of appliedNames) {
      if (!unionApplied.includes(name)) {
        unionApplied.push(name);
      }
    }

    mkdirSync(manifestDir, { recursive: true });
    writeFileSync(
      manifestPath,
      JSON.stringify({ applied: unionApplied, base, at: now() }, null, 2) + "\n",
      "utf8"
    );
    filesWritten.push(".0gkit/kits.json");

    // Generate src/kits.ts aggregator for mcp-agent base projects (K6 T4)
    if (base === "mcp-agent") {
      // Build the import list from unionApplied — only kits with an mcp-agent adapter
      type AdapterEntry = { alias: string; importSpecifier: string };
      const adapterEntries: AdapterEntry[] = [];

      for (const name of unionApplied) {
        const manifest = getKit(name, registry);
        if (!manifest) continue;
        const mcpAdapters = manifest.tiers.adapters?.["mcp-agent"];
        if (!mcpAdapters || mcpAdapters.length === 0) continue;

        const entryFile = mcpAdapters[0]; // e.g. "src/tools/memory.ts"
        // Convert alias: camelCase(name) + "Plugin"
        const alias =
          name.replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase()) +
          "Plugin";
        // Convert entryFile to ESM specifier relative to src/kits.ts:
        //   "src/tools/memory.ts" -> "./tools/memory.js"
        const specifier =
          "./" + entryFile.replace(/^src\//, "").replace(/\.ts$/, ".js");
        adapterEntries.push({ alias, importSpecifier: specifier });
      }

      // Hand-format — do NOT add prettier as a runtime dep
      const importLines = adapterEntries
        .map(
          ({ alias, importSpecifier }) =>
            `import { mcpToolPlugin as ${alias} } from "${importSpecifier}";`
        )
        .join("\n");

      const pluginItems = adapterEntries
        .map(({ alias }) => `  ${alias}(process.env),`)
        .join("\n");

      let kitsFileContent: string;
      if (adapterEntries.length === 0) {
        kitsFileContent =
          "// AUTO-GENERATED by `0g add` (applyKit) — do not edit by hand.\n" +
          "// Wires each applied kit's MCP tools into the local 0gkit server.\n" +
          "export const kitPlugins = [];\n";
      } else {
        kitsFileContent =
          "// AUTO-GENERATED by `0g add` (applyKit) — do not edit by hand.\n" +
          "// Wires each applied kit's MCP tools into the local 0gkit server.\n" +
          importLines +
          "\n\n" +
          "export const kitPlugins = [\n" +
          pluginItems +
          "\n];\n";
      }

      const srcDir = join(dest, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "kits.ts"), kitsFileContent, "utf8");
      filesWritten.push("src/kits.ts");
    }
  }

  return {
    applied: appliedNames,
    filesWritten,
    envAdded,
    notes,
    token: "[0gkit:kit-applied]",
  };
}
