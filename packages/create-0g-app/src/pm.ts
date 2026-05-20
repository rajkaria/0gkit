import type { PackageManager } from "./types.js";

/**
 * Detect the package manager that invoked us by inspecting
 * `npm_config_user_agent`. Both `npm`/`npx`/`pnpm dlx`/`yarn dlx`/`bun create`
 * set this — so when a user runs `pnpm create 0g-app`, we install with pnpm.
 */
export function detectPackageManager(
  opts: { env?: NodeJS.ProcessEnv } = {}
): PackageManager {
  // When the caller passes `env`, use it verbatim. Otherwise fall back to the
  // process env. This makes the function trivially testable — pass `{ env: {} }`
  // to assert the "no signal → npm" default.
  const env = opts.env ?? process.env;
  const ua = env.npm_config_user_agent ?? "";
  if (ua.startsWith("pnpm")) return "pnpm";
  if (ua.startsWith("yarn")) return "yarn";
  if (ua.startsWith("bun")) return "bun";
  return "npm";
}

export function installCommand(pm: PackageManager): string[] {
  if (pm === "pnpm") return ["pnpm", "install"];
  if (pm === "yarn") return ["yarn"];
  if (pm === "bun") return ["bun", "install"];
  return ["npm", "install"];
}

export function devCommand(pm: PackageManager, script = "dev"): string {
  if (pm === "pnpm") return `pnpm ${script}`;
  if (pm === "yarn") return `yarn ${script}`;
  if (pm === "bun") return `bun run ${script}`;
  return `npm run ${script}`;
}
