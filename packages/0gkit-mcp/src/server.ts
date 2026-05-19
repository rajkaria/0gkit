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

export const VERSION = "0.1.0";

export interface ZeroGMcpOptions {
  /** Dependency override (testing). Defaults to the real `@foundryprotocol/0gkit-*` packages. */
  deps?: McpDeps;
  /**
   * Pre-resolved Foundry plugin. When omitted, the server attempts an opt-in
   * load (ZEROG_FOUNDRY) at construction time. Pass `null` to force-disable.
   */
  foundryPlugin?: FoundryPlugin | null;
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

  const tools: Tool[] = foundry ? [...TOOLS, ...foundry.tools] : [...TOOLS];

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    const neutral = handlers[name];
    if (neutral) return (await neutral(args)) as CallToolResult;
    if (foundry && foundry.tools.some((t) => t.name === name)) {
      return (await foundry.call(name, args)) as CallToolResult;
    }
    const result: ToolCallResult = {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: `Unknown tool: ${name}`,
              hint: foundry
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
