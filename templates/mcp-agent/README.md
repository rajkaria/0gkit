# mcp-agent

Wire the **neutral 0G MCP server**
([`@foundryprotocol/0gkit-mcp`](https://www.npmjs.com/package/@foundryprotocol/0gkit-mcp))
into any agent runtime. Every 0G primitive is exposed as an `og_*` MCP tool
so Claude Desktop / Cursor / Cline / a custom client can drive 0G directly —
no glue code.

| Tool                | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `og_storage_put`    | Upload bytes to 0G Storage → root + funding tx |
| `og_storage_get`    | Download a blob by root                        |
| `og_storage_exists` | Is a root retrievable?                         |
| `og_infer`          | Chat completion against a 0G compute provider  |
| `og_da_publish`     | Publish a blob to 0G Data Availability         |
| `og_da_verify`      | Recompute a DA digest and compare              |
| `og_chain_faucet`   | Request testnet funds for an address           |
| `og_chain_balance`  | Native 0G balance of an address                |
| `og_attest_verify`  | Verify a TEE attestation (digest + signer)     |

## Prerequisites

- Node.js **>= 20.10**

## Clone

```bash
npx degit rajkaria/0gkit/templates/mcp-agent mcp-agent
cd mcp-agent
npm install
cp .env.example .env   # all vars optional; defaults to Galileo testnet
```

## Run the server (sanity check)

```bash
npm start
```

It connects over stdio and logs the available tools to stderr. An MCP
client speaks to it over stdin/stdout — running it bare just confirms it
boots. Press Ctrl-C to stop.

## Wire it into an agent

The published binary needs no project at all
(`npx -y @foundryprotocol/0gkit-mcp`). `src/index.ts` is the programmatic
equivalent — use it when you want to customize options.

### Claude Desktop

Add to `claude_desktop_config.json` (macOS:
`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "0gkit": {
      "command": "npx",
      "args": ["-y", "@foundryprotocol/0gkit-mcp"],
      "env": {
        "ZEROG_NETWORK": "galileo",
        "ZEROG_PRIVATE_KEY": "0x…",
        "ZEROG_PROVIDER": "0x…"
      }
    }
  }
}
```

To run this cloned project instead of the published binary:

```json
{
  "mcpServers": {
    "0gkit": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/mcp-agent/src/index.ts"],
      "env": { "ZEROG_NETWORK": "galileo" }
    }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json` (or the project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "0gkit": {
      "command": "npx",
      "args": ["-y", "@foundryprotocol/0gkit-mcp"],
      "env": { "ZEROG_NETWORK": "galileo" }
    }
  }
}
```

## Environment

| Var                 | Purpose                                      |
| ------------------- | -------------------------------------------- |
| `ZEROG_NETWORK`     | `galileo` (default), `aristotle`, or `local` |
| `ZEROG_RPC_URL`     | Override the preset RPC                      |
| `ZEROG_PRIVATE_KEY` | Signer key (funds storage uploads)           |
| `ZEROG_BROKER_KEY`  | Funded broker key for inference              |
| `ZEROG_PROVIDER`    | Default 0G inference provider address        |
| `ZEROG_FOUNDRY`     | `1` to enable the opt-in Foundry plugin      |

Defaults to the **Galileo testnet** — no real funds needed. Get testnet
funds with the `og_chain_faucet` tool or <https://faucet.0g.ai>.

## Docs

- 0gkit: <https://github.com/rajkaria/0gkit>
- Model Context Protocol: <https://modelcontextprotocol.io>

## Deploy on Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Frajkaria%2F0gkit%2Ftree%2Fmain%2Ftemplates%2Fmcp-agent&project-name=0gkit-mcp-agent&env=NETWORK%2CPRIVATE_KEY&envDescription=See%20docs.0gkit.com%20env%20vars&envLink=https%3A%2F%2Fdocs.0gkit.com%2Fgetting-started%2Fenv-vars)

Vercel will fork the template into a new repository, prompt for the listed
env vars, and deploy in under 60 seconds on Fluid Compute.

## What next?

1. **Wire to a real agent** — point Claude Desktop or Cursor at this `npm start` command (see the copy-paste config above).
2. **Extend** — register custom tools by adding handlers in your own MCP server next to `create0gMcpServer()`; enable the opt-in Foundry plugin with `ZEROG_FOUNDRY=1`.
3. **Run as a service** — host this binary on a Vercel Function or fly machine, then bridge stdio over WebSocket/HTTP using `@modelcontextprotocol/sdk` transports.
