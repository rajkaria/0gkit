/**
 * config-init.ts — MCP config writer for `0g mcp init <agent>` (K6 T3).
 *
 * `buildMcpConfig` produces the agent-specific config object + file path.
 * By default it points at the neutral published server (`npx -y @foundryprotocol/0gkit-mcp`).
 * When run inside a kitted `mcp-agent` project (project scope, base="mcp-agent", kits applied),
 * it switches to the local project server (`npm --prefix <cwd> start`) so kit tools show up.
 *
 * No `OGKIT_MCP_KITS` env var — local mode works by pointing at the local server command (D88).
 */

import { ConfigError } from "@foundryprotocol/0gkit-core";

export const AGENTS = ["cursor", "claude", "windsurf", "codex"] as const;
export type AgentName = (typeof AGENTS)[number];
export type McpScope = "project" | "global";

const PATHS: Record<AgentName, { project: string; global: string }> = {
  cursor: { project: ".cursor/mcp.json", global: ".cursor/mcp.json" },
  claude: { project: ".mcp.json", global: ".claude/mcp.json" },
  windsurf: {
    project: ".windsurf/mcp.json",
    global: ".codeium/windsurf/mcp_config.json",
  },
  codex: { project: ".codex/mcp.json", global: ".codex/mcp.json" },
};

export interface AppliedKits {
  applied: string[];
  base: string;
}

export interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface BuiltMcpConfig {
  path: string;
  json: { mcpServers: Record<string, McpServerEntry> };
  mode: "neutral" | "local";
  kits: string[];
}

export function buildMcpConfig(opts: {
  agent: AgentName;
  scope: McpScope;
  home: string;
  cwd: string;
  applied?: AppliedKits | null;
}): BuiltMcpConfig {
  if (!(AGENTS as readonly string[]).includes(opts.agent)) {
    throw new ConfigError(
      `Unknown agent '${opts.agent}'.`,
      `Use one of: ${AGENTS.join(", ")}.`
    );
  }

  const rel = PATHS[opts.agent][opts.scope];
  const base = opts.scope === "global" ? opts.home : opts.cwd;
  const path = `${base}/${rel}`;

  // Local mode only when: project scope + mcp-agent base + at least one kit applied.
  const useLocal =
    opts.scope === "project" &&
    opts.applied?.base === "mcp-agent" &&
    (opts.applied?.applied.length ?? 0) > 0;

  const entry: McpServerEntry = useLocal
    ? { command: "npm", args: ["--prefix", opts.cwd, "start"] }
    : { command: "npx", args: ["-y", "@foundryprotocol/0gkit-mcp"] };

  return {
    path,
    json: { mcpServers: { "0gkit": entry } },
    mode: useLocal ? "local" : "neutral",
    kits: useLocal ? [...(opts.applied?.applied ?? [])] : [],
  };
}

/**
 * Minimal reader interface — accepts the CLI's FsLike (readFile→Uint8Array)
 * or any object with a compatible readFile method.
 */
export interface KitsReader {
  readFile(path: string): Promise<Uint8Array | string>;
}

/**
 * Read the `.0gkit/kits.json` manifest and return {applied, base}.
 * Returns null on any error (missing file, malformed JSON, wrong shape).
 */
export async function readAppliedKits(
  cwd: string,
  fs: KitsReader
): Promise<AppliedKits | null> {
  try {
    const raw = await fs.readFile(`${cwd}/.0gkit/kits.json`);
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    const parsed = JSON.parse(text) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as Record<string, unknown>).applied) &&
      typeof (parsed as Record<string, unknown>).base === "string"
    ) {
      return {
        applied: (parsed as Record<string, unknown>).applied as string[],
        base: (parsed as Record<string, unknown>).base as string,
      };
    }
    return null;
  } catch {
    return null;
  }
}
