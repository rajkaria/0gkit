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
 *   1. `@modelcontextprotocol/sdk` in deps or devDeps  →  "mcp-agent"
 *   2. `next` AND `@foundryprotocol/0gkit-indexer` in deps/devDeps  →  "chat"
 *      (chat is distinguished from react-app by having 0gkit-indexer)
 *   3. `next` in deps or devDeps (without 0gkit-indexer)  →  "react-app"
 *   4. `@foundryprotocol/0gkit-storage` in deps/devDeps
 *      AND no `next` present  →  "storage-app"
 *   5. otherwise  →  "node"
 *
 * Rationale for ordering:
 *   - mcp-agent is checked first because none of the Next.js-based templates
 *     use @modelcontextprotocol/sdk in their base package.json.
 *   - chat and react-app both use `next`; chat also has `0gkit-indexer`
 *     (for reorg-safe event streaming). This is the most reliable signal.
 *   - storage-app is a pure Node/ESM CLI — it has 0gkit-storage but no next.
 *   - The remaining templates (inference-app, ai-agent, etc.) fall through to
 *     "node"; "node" is always a compatible fallback for lib-only kits.
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

  // 1. MCP agent (checked before Next.js because the two are mutually exclusive
  //    in the template set, and this avoids any ambiguity)
  if ("@modelcontextprotocol/sdk" in allDeps) {
    return "mcp-agent";
  }

  // 2+3. Next.js-based templates: disambiguate chat from react-app via indexer dep
  if ("next" in allDeps) {
    if ("@foundryprotocol/0gkit-indexer" in allDeps) {
      return "chat";
    }
    return "react-app";
  }

  // 4. storage-app: Node/ESM CLI with 0gkit-storage but no Next.js
  if ("@foundryprotocol/0gkit-storage" in allDeps) {
    return "storage-app";
  }

  // 5. Default
  return "node";
}
