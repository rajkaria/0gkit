/**
 * K5-D — pure, injectable auto-fixers for `0g doctor --fix`.
 *
 * Hard invariant (D85): a fixer NEVER auto-installs packages or mutates any
 * network state. It only ever writes `.env*` files or returns a command string
 * for the human to run. Every fixer is pure over its injected `DoctorFixDeps`
 * so the unit tests stay fully offline (no fs, no registry, no config load).
 */

export interface DoctorFixDeps {
  fs: {
    exists: (p: string) => Promise<boolean>;
    writeFile: (p: string, data: string) => Promise<void>;
  };
  /**
   * Load the project's `0g.config.ts` and return the object exposing
   * `envExample()` (the `define0GConfig` result), or `null` when it cannot be
   * loaded. Injected so the fixers stay testable — the production default is
   * honest and returns `null` (see `defaultLoadProjectConfig` in cli.ts): the
   * CLI cannot type-check + import an arbitrary project TS config at runtime.
   */
  loadProjectConfig: (
    cwd: string
  ) => Promise<{ envExample: () => string } | null>;
  /** Merged `dependencies` + `devDependencies` from the project's package.json. */
  readProjectPins: (cwd: string) => Promise<Record<string, string>>;
  /** Latest published version of a package as reported by the registry. */
  latestVersion: (pkg: string) => Promise<string>;
}

/**
 * Regenerate `.env.example` from `define0GConfig().envExample()`, and seed
 * `.env.local` from the same body **only if it does not already exist**.
 *
 * Idempotent: `.env.example` is always (re)written with identical bytes, and
 * `.env.local` is never clobbered once present — so re-running is a no-op on an
 * already-fixed project. Returns a human-readable summary, or `null` when the
 * project config could not be loaded (nothing was written in that case).
 */
export async function genEnvFromConfig(
  cwd: string,
  deps: DoctorFixDeps
): Promise<string | null> {
  const cfg = await deps.loadProjectConfig(cwd);
  if (!cfg) return null;
  const body = cfg.envExample();
  await deps.fs.writeFile(`${cwd}/.env.example`, body);
  if (!(await deps.fs.exists(`${cwd}/.env.local`))) {
    await deps.fs.writeFile(`${cwd}/.env.local`, body);
    return "wrote .env.example + .env.local from define0GConfig";
  }
  return "wrote .env.example from define0GConfig (.env.local already exists — left untouched)";
}

/**
 * Build the `npm install …@latest` line for every `@foundryprotocol/0gkit-*`
 * pin whose (caret/tilde-stripped) version is below the latest registry
 * version. Non-0gkit packages are ignored. Returns `null` when nothing is
 * stale. Prints a command — it never installs (D85).
 */
export async function bumpStalePins(
  cwd: string,
  deps: DoctorFixDeps
): Promise<string | null> {
  const pins = await deps.readProjectPins(cwd);
  const stale: string[] = [];
  for (const [pkg, pin] of Object.entries(pins)) {
    if (!pkg.startsWith("@foundryprotocol/0gkit-")) continue;
    const latest = await deps.latestVersion(pkg);
    const normalised = pin.replace(/^[\^~]/, "");
    if (compareSemver(normalised, latest) < 0) stale.push(`${pkg}@latest`);
  }
  return stale.length ? `npm install ${stale.join(" ")}` : null;
}

/**
 * The exact `0g dev` fallback command surfaced when the given network's RPC is
 * unreachable — start a local devnet and re-run against it. Pure string; never
 * spawns anything.
 */
export function rpcFallbackCmd(network: string): string {
  return `0g dev   # then re-run with --network local (${network} RPC unreachable)`;
}

/**
 * Numeric-dotted semver compare (major.minor.patch, ignoring any pre-release
 * suffix). Returns <0 if `a` precedes `b`, 0 if equal, >0 otherwise. Avoids the
 * lexicographic-string trap where `"1.10.0" < "1.9.0"` compares true.
 */
function compareSemver(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .split("-")[0]!
      .split(".")
      .map((n) => Number.parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
