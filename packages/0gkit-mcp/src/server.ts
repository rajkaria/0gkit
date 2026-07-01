import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { TOOLS, makeHandlers, defaultDeps, type McpDeps } from "./tools.js";
import { loadFoundryPlugin, type FoundryPlugin } from "./foundry-plugin.js";
import type { ToolCallResult } from "./context.js";
import type { McpToolPlugin } from "./plugin.js";

export const VERSION = "0.1.0";

export interface ZeroGMcpOptions {
  /** Dependency override (testing). Defaults to the real `@foundryprotocol/0gkit-*` packages. */
  deps?: McpDeps;
  /**
   * Pre-resolved Foundry plugin. When omitted, the server attempts an opt-in
   * load (ZEROG_FOUNDRY) at construction time. Pass `null` to force-disable.
   */
  foundryPlugin?: FoundryPlugin | null;
  /**
   * Additional tool plugins (e.g. kit adapters built with `collectToolPlugin`).
   * These are merged with the Foundry plugin — all plugins' tools are listed and
   * all plugin calls are routed by tool name. Neutral `og_*` tools always win
   * when there is a name collision.
   */
  plugins?: McpToolPlugin[];
}

/**
 * Build the neutral 0G MCP server. Every `@foundryprotocol/0gkit-*` primitive is exposed as an
 * `og_*` tool. The Foundry plugin (if loaded) contributes additional tools
 * under its own names — opt-in and absent by default.
 */
export async function create0gMcpServer(
  options: ZeroGMcpOptions = {}
): Promise<Server> {
  const deps = options.deps ?? defaultDeps();
  const handlers = makeHandlers(deps);
  const foundry =
    options.foundryPlugin !== undefined
      ? options.foundryPlugin
      : await loadFoundryPlugin({ env: deps.env });

  const server = new Server(
    { name: "0gkit", version: VERSION },
    { capabilities: { tools: {} } }
  );

  // Merge plugins: user-supplied plugins first, then foundry (if present).
  const allPlugins: McpToolPlugin[] = [
    ...(options.plugins ?? []),
    ...(foundry ? [foundry] : []),
  ];

  const tools: Tool[] = [...TOOLS, ...allPlugins.flatMap((p) => p.tools)];

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    const neutral = handlers[name];
    if (neutral) return (await neutral(args)) as CallToolResult;
    const plugin = allPlugins.find((p) => p.tools.some((t) => t.name === name));
    if (plugin) return (await plugin.call(name, args)) as CallToolResult;
    const result: ToolCallResult = {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: `Unknown tool: ${name}`,
              // List the known tools whenever any plugin (kit or foundry) is
              // wired; only fall back to the foundry opt-in hint on a bare
              // neutral server (no plugins at all).
              hint:
                allPlugins.length > 0
                  ? `Known: ${tools.map((t) => t.name).join(", ")}`
                  : `Foundry tools are opt-in — set ZEROG_FOUNDRY=1 to enable them.`,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
    return result as CallToolResult;
  });

  return server;
}
