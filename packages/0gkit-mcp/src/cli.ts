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

function printHelp(): void {
  process.stdout.write(`0g-mcp — Neutral 0G MCP server

Usage:
  0g-mcp [options]

Options:
  -h, --help       Show this help message
  -V, --version    Show package version

Run without flags to start the stdio MCP server.
`);
}

async function main(): Promise<void> {
  const [arg] = process.argv.slice(2);
  if (arg === "--help" || arg === "-h") {
    printHelp();
    return;
  }
  if (arg === "--version" || arg === "-V") {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

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
