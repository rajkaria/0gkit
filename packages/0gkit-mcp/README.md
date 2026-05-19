# @foundryprotocol/0gkit-mcp

The **neutral 0G MCP server**. Every 0G primitive is exposed as an MCP tool so
Claude Desktop / Cursor / Cline / any agent runtime can drive 0G directly — no
glue code, no Foundry dependency.

Foundry ships as a **separate, opt-in plugin** (`ZEROG_FOUNDRY=1`) and is
**absent by default**. `@foundryprotocol/0gkit-*` never imports `@foundryprotocol/*` — this is
enforced in CI by `pnpm boundary:check`.

## Tools

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

Every error is a `ZeroGError` with an actionable `hint` (missing env var,
unreachable endpoint, which attestation check failed).

## Use it with Claude Desktop

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

Defaults to the **Galileo testnet** — no real funds needed. Get testnet funds
with the `og_chain_faucet` tool or https://faucet.0g.ai.

### Environment

| Var                 | Purpose                                      |
| ------------------- | -------------------------------------------- |
| `ZEROG_NETWORK`     | `galileo` (default), `aristotle`, or `local` |
| `ZEROG_RPC_URL`     | Override the preset RPC                      |
| `ZEROG_PRIVATE_KEY` | Signer key (funds storage uploads)           |
| `ZEROG_BROKER_KEY`  | Funded broker key for inference              |
| `ZEROG_PROVIDER`    | Default 0G inference provider address        |
| `ZEROG_FOUNDRY`     | `1` to enable the opt-in Foundry plugin      |

## Programmatic

```ts
import { create0gMcpServer } from "@foundryprotocol/0gkit-mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = await create0gMcpServer();
await server.connect(new StdioServerTransport());
```

## Foundry plugin (opt-in)

Set `ZEROG_FOUNDRY=1` and install `@foundryprotocol/mcp`. The neutral server
loads its tools (`list_ingots`, `run_inference`, `get_ingot`, `get_lineage`,
`get_attestation`) via a computed specifier so the neutrality boundary stays
green by construction. Without the opt-in, those tools do not appear.

MIT
