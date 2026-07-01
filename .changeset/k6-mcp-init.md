---
"@foundryprotocol/0gkit-mcp": minor
"@foundryprotocol/0gkit-kits": minor
"@foundryprotocol/0gkit-cli": minor
---

K6 — `0g mcp init <agent>` wires 0gkit into Cursor / Claude / Windsurf / Codex in one command.

- **`0gkit-cli`**: new `0g mcp init <agent> [--global]` writes the editor's MCP config. By default it points at the neutral `npx @foundryprotocol/0gkit-mcp` server (nine `og_*` tools); inside a kitted `mcp-agent` project it points at the local project server so the kit's own MCP tools appear too. Lazy-imports `0gkit-mcp` (cold-start unchanged).
- **`0gkit-mcp`**: `create0gMcpServer({ plugins })` generalizes the plugin seam; new `collectToolPlugin()` adapts a `register(server, opts)` tool module into a plugin; new `buildMcpConfig()` / `readAppliedKits()` config writer. Each `mcp-agent` kit adapter now also exports an `mcpToolPlugin` factory.
- **`0gkit-kits`**: `applyKit` on the `mcp-agent` base generates a `src/kits.ts` aggregator that wires every applied kit's `mcpToolPlugin` into the local server.

The neutral server never imports a kit overlay — kit tools run in your own scaffolded project. No new env vars.
