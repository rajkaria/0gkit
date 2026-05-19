#!/usr/bin/env node
/**
 * Neutral 0G MCP server — stdio entrypoint.
 *
 * Wire into any MCP client config, e.g. Claude Desktop:
 *
 * {
 *   "mcpServers": {
 *     "0gkit": {
 *       "command": "npx",
 *       "args": ["-y", "@foundryprotocol/0gkit-mcp"],
 *       "env": {
 *         "ZEROG_NETWORK": "galileo",
 *         "ZEROG_PRIVATE_KEY": "0x…",
 *         "ZEROG_PROVIDER": "0x…"
 *       }
 *     }
 *   }
 * }
 *
 * Foundry tools are opt-in: add "ZEROG_FOUNDRY": "1" (requires
 * @foundryprotocol/mcp to be installed).
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { create0gMcpServer, VERSION } from "./server.js";
import { loadFoundryPlugin } from "./foundry-plugin.js";

async function main(): Promise<void> {
  const foundry = await loadFoundryPlugin();
  const server = await create0gMcpServer({ foundryPlugin: foundry });
  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write(
    `0gkit-mcp v${VERSION} ready · network=${
      process.env.ZEROG_NETWORK ?? "galileo"
    }${foundry ? ` · foundry plugin: ${foundry.name}` : " · foundry: off"}\n`
  );
}

main().catch((err) => {
  process.stderr.write(
    `0gkit-mcp fatal: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(1);
});
