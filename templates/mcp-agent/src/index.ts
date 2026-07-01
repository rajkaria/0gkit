/**
 * mcp-agent — start the neutral 0G MCP server over stdio.
 *
 * This is exactly what an agent runtime (Claude Desktop, Cursor, Cline, or
 * a custom MCP client) spawns and talks to over stdin/stdout. Every 0G
 * primitive — Storage, Compute inference, Data Availability, native chain,
 * and TEE attestation — is exposed as an `og_*` tool.
 *
 * Run it directly to confirm it boots:   npm start
 * Then point an MCP client at this same command (see README for the
 * copy-paste Claude Desktop / Cursor config).
 *
 * Equivalent zero-code option: `npx -y @foundryprotocol/0gkit-mcp` runs the
 * published binary with no project at all. This file exists so you can
 * customize options (deps, Foundry plugin) programmatically.
 */
import { create0gMcpServer } from "@foundryprotocol/0gkit-mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { printFirstSuccess } from "@foundryprotocol/0gkit-core";
import { config } from "../0g.config.js";
import { kitPlugins } from "./kits.js";

async function main(): Promise<void> {
  // Validate env up-front via the typed config so a misconfigured runtime
  // surfaces a clear ConfigError before the MCP transport opens.
  const env = config.server();

  // Foundry is opt-in and absent unless ZEROG_FOUNDRY=1 is set. Pass
  // `{ foundryPlugin: null }` to create0gMcpServer() to force-disable it.
  const server = await create0gMcpServer({ plugins: kitPlugins });
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdout is the MCP wire; log status to stderr so it doesn't corrupt it.
  // printFirstSuccess writes via console.log by default — route it to stderr
  // so the wire stays clean for protocol traffic.
  const stderrSink = (line: string) => console.error(line);
  printFirstSuccess(
    {
      op: "mcp.connect",
      id: "stdio",
      note: `network=${env.ZEROG_NETWORK}`,
    },
    stderrSink
  );
  console.error(
    "0gkit MCP server connected over stdio. " +
      "Tools: og_storage_put, og_storage_get, og_storage_exists, og_infer, " +
      "og_da_publish, og_da_verify, og_chain_faucet, og_chain_balance, " +
      "og_attest_verify. Plus any kit tools wired via ./kits.ts."
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
