import { isReactBase } from "./bases.js";
import type { KitManifest } from "./manifest.js";
import { KITS } from "./registry.generated.js";

// ---------------------------------------------------------------------------
// resolveTiers
// ---------------------------------------------------------------------------

/**
 * Resolves the list of file paths that are applicable for the given kit +
 * base combination.
 *
 * Resolution order:
 *   1. All entries in `manifest.tiers.lib`
 *   2. `manifest.tiers.adapters?.[base]` if present
 *   3. `manifest.tiers.ui` if `isReactBase(base)` is true
 *
 * Task 6 may extend this; keep the signature stable.
 */
export function resolveTiers(manifest: KitManifest, base: string): string[] {
  const result: string[] = [...manifest.tiers.lib];

  const adapterFiles = manifest.tiers.adapters?.[base];
  if (adapterFiles) {
    result.push(...adapterFiles);
  }

  if (isReactBase(base) && manifest.tiers.ui) {
    result.push(...manifest.tiers.ui);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Registry accessors
// ---------------------------------------------------------------------------

/**
 * Returns the full kit registry embedded at build time.
 * With zero kits in `templates/_kits/` this will be an empty array.
 */
export function loadRegistry(): KitManifest[] {
  return KITS;
}

/**
 * Looks up a single kit by name.
 *
 * @param name     The kebab-case kit name (e.g. "agent-memory").
 * @param registry Optional registry override; defaults to the build-time KITS list.
 * @returns The matching manifest, or `undefined` if not found.
 */
export function getKit(
  name: string,
  registry: KitManifest[] = KITS,
): KitManifest | undefined {
  return registry.find((k) => k.name === name);
}

/**
 * Lists kits, optionally filtered by target base.
 *
 * Filtering rules (both conditions must hold):
 *   - `base` must be present in the kit's `compatibleBases` array.
 *   - `resolveTiers(kit, base)` must be non-empty (i.e. the kit contributes
 *     at least one file for that base — either a lib file, an adapter, or a
 *     React UI layer on a React base).
 *
 * When no `base` is specified, all kits are returned without filtering.
 *
 * @param options.base     Optional target base string.
 * @param options.registry Optional registry override; defaults to KITS.
 */
export function listKits({
  base,
  registry = KITS,
}: {
  base?: string;
  registry?: KitManifest[];
} = {}): KitManifest[] {
  if (!base) return registry;

  return registry.filter(
    (kit) =>
      kit.compatibleBases.includes(base) &&
      resolveTiers(kit, base).length > 0,
  );
}
