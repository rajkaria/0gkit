import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The set of 0gkit template bases that are React-capable (require a React/Next.js
 * environment). Used by the kits engine to gate component-level overlays that
 * depend on JSX / React hooks.
 */
export const REACT_BASES: ReadonlySet<string> = new Set(["react-app", "chat"]);

/**
 * Returns true if the given base string is a React-capable base.
 */
export function isReactBase(base: string): boolean {
  return REACT_BASES.has(base);
}

/**
 * Detects the 0gkit template base for a project directory by inspecting its
 * package.json dependencies.
 *
 * Detection rules (first match wins):
 *   - `next` in deps or devDeps  →  "react-app"
 *   - `@modelcontextprotocol/sdk` in deps or devDeps  →  "mcp-agent"
 *   - otherwise  →  "node"
 *
 * The presence of a `0g.config.ts` file is a signal that this is a 0gkit
 * project, but base classification is entirely driven by the framework dep.
 *
 * A missing or unreadable/malformed package.json gracefully falls back to "node".
 */
export function detectBase(dir: string): string {
  let pkg: Record<string, unknown>;

  try {
    const raw = readFileSync(join(dir, "package.json"), "utf8");
    pkg = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return "node";
  }

  const deps = (pkg["dependencies"] ?? {}) as Record<string, string>;
  const devDeps = (pkg["devDependencies"] ?? {}) as Record<string, string>;
  const allDeps = { ...deps, ...devDeps };

  if ("next" in allDeps) {
    return "react-app";
  }

  if ("@modelcontextprotocol/sdk" in allDeps) {
    return "mcp-agent";
  }

  return "node";
}
