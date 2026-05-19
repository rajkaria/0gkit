/**
 * Optional Foundry MCP plugin loader. Foundry is NEVER a static dependency of
 * the neutral MCP server (spec §2/§4). We resolve `@foundryprotocol/mcp` via a
 * COMPUTED specifier so dependency-cruiser builds no graph edge and `pnpm
 * boundary:check` stays green by construction (mirrors the CLI's
 * foundry-loader; see DECISIONS.md D4).
 *
 * Absent by default: the plugin loads ONLY when explicitly opted in
 * (ZEROG_FOUNDRY truthy or `optIn: true`) AND `@foundryprotocol/mcp` resolves
 * AND it exports the `foundryMcpPlugin` adapter.
 */
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ToolCallResult } from "./context.js";

export interface FoundryPlugin {
  name: string;
  tools: Tool[];
  call(name: string, args: Record<string, unknown>): Promise<ToolCallResult>;
}

interface FoundryPluginModule {
  foundryMcpPlugin?: (opts: {
    baseUrl?: string;
    defaultIngotId?: string;
  }) => FoundryPlugin;
}

export interface LoadFoundryOptions {
  /** Force-enable even without ZEROG_FOUNDRY (used by the CLI `--foundry`). */
  optIn?: boolean;
  env?: Record<string, string | undefined>;
}

function truthy(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
}

export async function loadFoundryPlugin(
  opts: LoadFoundryOptions = {}
): Promise<FoundryPlugin | null> {
  const env = opts.env ?? process.env;
  const enabled = opts.optIn === true || truthy(env.ZEROG_FOUNDRY);
  if (!enabled) return null;

  // Non-literal specifier — static analyzers cannot resolve this, so no edge.
  const spec = ["@foundryprotocol", "mcp"].join("/");
  try {
    const mod = (await import(/* @vite-ignore */ spec)) as FoundryPluginModule;
    if (typeof mod.foundryMcpPlugin !== "function") return null;
    return mod.foundryMcpPlugin({
      baseUrl: env.FOUNDRY_BASE_URL,
      defaultIngotId: env.FOUNDRY_DEFAULT_INGOT_ID,
    });
  } catch {
    return null;
  }
}
