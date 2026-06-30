/** Subset of package.json fields that kits may contribute. */
export interface PartialPackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * Deep-merge `dependencies`, `devDependencies`, and `scripts` from `incoming`
 * into `base`. **Existing keys in `base` win on conflict** — we never
 * downgrade or overwrite a version already present.
 *
 * Returns a new object; inputs are never mutated.
 */
export function mergePackageJson(
  base: PartialPackageJson,
  incoming: PartialPackageJson,
): PartialPackageJson {
  const mergeRecord = (
    a: Record<string, string> | undefined,
    b: Record<string, string> | undefined,
  ): Record<string, string> | undefined => {
    if (!a && !b) return undefined;
    // base keys win: spread incoming first, then spread base on top
    return { ...(b ?? {}), ...(a ?? {}) };
  };

  const deps = mergeRecord(base.dependencies, incoming.dependencies);
  const devDeps = mergeRecord(base.devDependencies, incoming.devDependencies);
  const scripts = mergeRecord(base.scripts, incoming.scripts);

  const result: PartialPackageJson = { ...base };

  if (deps !== undefined) result.dependencies = deps;
  if (devDeps !== undefined) result.devDependencies = devDeps;
  if (scripts !== undefined) result.scripts = scripts;

  return result;
}

/** Shape matching `KitManifest["env"][number]`. */
export interface EnvVar {
  key: string;
  example: string;
  note?: string;
}

/**
 * Append a `# <note>\n<KEY>=<example>` block for each var whose KEY is not
 * already present as a line matching `^KEY=` in `current`.
 *
 * Idempotent: re-applying the same vars produces a byte-identical string.
 */
export function appendEnv(current: string, vars: EnvVar[]): string {
  let result = current;
  for (const { key, example, note } of vars) {
    // Check whether KEY= already appears at the start of any line
    const pattern = new RegExp(`^${key}=`, "m");
    if (pattern.test(result)) continue;

    // Ensure there's a trailing newline before appending
    if (result.length > 0 && !result.endsWith("\n")) {
      result += "\n";
    }

    const block = note ? `# ${note}\n${key}=${example}\n` : `${key}=${example}\n`;
    result += block;
  }
  return result;
}
