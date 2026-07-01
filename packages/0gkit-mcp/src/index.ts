/**
 * @foundryprotocol/0gkit-mcp
 *
 * The neutral 0G MCP server. Every 0G primitive — Storage, Compute (inference),
 * Data Availability, native chain (faucet/balance), and TEE attestation — is
 * exposed as an `og_*` MCP tool so Claude / Cursor / Cline / any agent runtime
 * drives 0G directly. Foundry ships as a separate, opt-in plugin loaded only
 * when configured (ZEROG_FOUNDRY=1); it is absent by default.
 *
 * Run as a stdio MCP server:
 *   npx @foundryprotocol/0gkit-mcp
 *
 * Or wire programmatically:
 *   import { create0gMcpServer } from '@foundryprotocol/0gkit-mcp';
 *   const server = await create0gMcpServer();
 *   await server.connect(transport);
 */
export { create0gMcpServer, VERSION, type ZeroGMcpOptions } from "./server.js";
export { TOOLS, makeHandlers, defaultDeps, type McpDeps } from "./tools.js";
export {
  loadFoundryPlugin,
  type FoundryPlugin,
  type LoadFoundryOptions,
} from "./foundry-plugin.js";
export { type ToolCallResult } from "./context.js";
export { collectToolPlugin, type McpToolPlugin, type McpServerLike } from "./plugin.js";
export {
  buildMcpConfig,
  readAppliedKits,
  AGENTS,
  type AgentName,
  type McpScope,
  type AppliedKits,
  type McpServerEntry,
  type BuiltMcpConfig,
  type KitsReader,
} from "./config-init.js";
