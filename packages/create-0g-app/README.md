# create-0g-app

Scaffold a [0G](https://0g.ai) app in seconds.

```bash
npm create 0g-app@latest my-app
```

`create-0g-app` clones a starter template, installs dependencies, writes a
network-aware `.env.example`, optionally `git init`s the project, and prints
a "next step" banner — so the only thing left for you is `cd my-app` and
running it.

## Templates

| Name                 | Use case                                                            |
| -------------------- | ------------------------------------------------------------------- |
| `storage-app`        | Upload + download a file, verify the Merkle root.                   |
| `inference-app`      | OpenAI-shaped chat against 0G Compute.                              |
| `attestation-verify` | Parse + verify a TEE attestation report (pure crypto, no network).  |
| `mcp-agent`          | Expose every 0G primitive as MCP tools for Claude/Cursor/Cline/etc. |
| `react-app`          | Next.js App Router app using `@foundryprotocol/0gkit-react` hooks.  |

## Usage

```bash
# Interactive (default — picks template, network, etc.)
npm create 0g-app@latest

# Non-interactive — pick everything from flags
npm create 0g-app@latest my-app \
  --template storage-app \
  --network  local        \
  --no-install            \
  --no-git
```

## Flags

| Flag                     | Default           | Description                                 |
| ------------------------ | ----------------- | ------------------------------------------- |
| `-t, --template <name>`  | _(prompt)_        | One of the five templates above.            |
| `-n, --network <name>`   | `local`           | `local` (pairs with `0g dev`) or `galileo`. |
| `--package-manager <pm>` | _(auto-detected)_ | `pnpm` / `npm` / `yarn` / `bun`.            |
| `--no-install`           | install enabled   | Skip dependency install.                    |
| `--no-git`               | git init enabled  | Skip git init.                              |

## Pairs with `0g dev`

`--network local` writes a `.env.example` that points at the local devnet
ports started by [`0g dev`](https://github.com/rajkaria/0G-ai-kit/tree/main/packages/0gkit-cli):

```bash
0g dev                # starts anvil + storage/compute/DA mocks
npm run dev           # the scaffolded app
```

## License

MIT
