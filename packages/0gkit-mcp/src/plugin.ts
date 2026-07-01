/**
 * Generic plugin seam for the 0G MCP server.
 *
 * `collectToolPlugin` is the single canonical way to build an `McpToolPlugin`
 * from any `register*Tools(server, opts)` function — it is kit-neutral and
 * knows nothing about which kit is calling it. Kit adapters call this factory
 * to expose themselves as a plugin without any static dependency on the MCP
 * server implementation.
 */
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { FoundryPlugin } from "./foundry-plugin.js";
import type { ToolCallResult } from "./context.js";

// ---------------------------------------------------------------------------
// Re-exports / aliases
// ---------------------------------------------------------------------------

/**
 * An MCP tool plugin. Structurally identical to `FoundryPlugin` so the Foundry
 * plugin is always a valid `McpToolPlugin` — the type alias enforces that.
 */
export type McpToolPlugin = FoundryPlugin;

/**
 * Minimal subset of the MCP Server interface required to register tools.
 * This is the **single source of truth** — kit adapters should import this
 * type instead of declaring their own local copy.
 */
export interface McpServerLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool(
    name: string,
    description: string,
    schema: object,
    handler: (args: any) => Promise<any>
  ): void;
}

// ---------------------------------------------------------------------------
// collectToolPlugin
// ---------------------------------------------------------------------------

/**
 * Build an `McpToolPlugin` from a `register*Tools(server, opts)` function.
 *
 * The collector intercepts every `.tool()` call during `register(collector, opts)`,
 * records the tool metadata and handler, then returns a plugin whose `.call()`
 * dispatches to the right handler by name.
 *
 * @param name     Plugin name (e.g. `"agent-memory"`).
 * @param register The kit's `register*Tools` function.
 * @param opts     Optional options forwarded to `register(collector, opts)`.
 */
export function collectToolPlugin(
  name: string,
  register: (s: McpServerLike, opts?: any) => void,
  opts?: any
): McpToolPlugin {
  const tools: Tool[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlers: Record<string, (args: any) => Promise<any>> = {};

  const collector: McpServerLike = {
    tool(
      toolName: string,
      description: string,
      schema: object,
      handler: (args: any) => Promise<any>
    ) {
      tools.push({
        name: toolName,
        description,
        inputSchema: schema as Tool["inputSchema"],
      });
      handlers[toolName] = handler;
    },
  };

  register(collector, opts);

  return {
    name,
    tools,
    async call(
      toolName: string,
      args: Record<string, unknown>
    ): Promise<ToolCallResult> {
      const h = handlers[toolName];
      if (!h) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { error: `Unknown tool in plugin "${name}": ${toolName}` },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
      return h(args) as Promise<ToolCallResult>;
    },
  };
}
