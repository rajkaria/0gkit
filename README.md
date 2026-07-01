# 0gkit — the neutral 0G builder toolkit

**Website:** [**0gkit.com**](https://0gkit.com) · **Docs:** [docs.0gkit.com](https://docs.0gkit.com) · **Playground:** [playground.0gkit.com](https://playground.0gkit.com)

[![CI](https://github.com/rajkaria/0gkit/actions/workflows/ci.yml/badge.svg)](https://github.com/rajkaria/0gkit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![npm](https://img.shields.io/npm/v/create-0gkit-app?label=create-0gkit-app)](https://www.npmjs.com/package/create-0gkit-app)
[![v1.0.0](https://img.shields.io/badge/release-v1.0.0-22d3ee.svg)](https://github.com/rajkaria/0gkit/releases/tag/v1.0.0)

**0gkit** is the fastest way to build on the [0G](https://0g.ai) network —
Storage, Compute (inference), Data Availability, TEE Attestation, and chain
helpers — as 18 small, independently-installable npm packages, plus a `0g`
CLI, an MCP server for AI agents, and React hooks.

It is **neutral and standalone**: no package depends on any application
framework or protocol. Install only what you need.

> Packages publish under the `@foundryprotocol/0gkit-*` npm scope. The code is
> protocol-neutral; the scope is just the publishing org. The CLI binary is `0g`.

## Quick start

```bash
npm create 0gkit-app@latest my-app
cd my-app
0g dev          # in another terminal — starts the local devnet
npm run dev
```

That is the whole thing. `create-0gkit-app` clones a template, writes a
network-aware `.env.example`, runs install, and `git init`s — so the only
thing left for you is `cd` + run.

Five templates ship today: `storage-app`, `inference-app`,
`attestation-verify`, `mcp-agent`, `react-app`. Pick one with
`--template <name>` or interactively at the prompt.

### Or install primitives directly

```bash
# One primitive at a time — install only what you use
npm i @foundryprotocol/0gkit-storage   # upload / download / Merkle root
npm i @foundryprotocol/0gkit-compute   # provider discovery + inference
npm i @foundryprotocol/0gkit-da        # data availability publish / verify
npm i @foundryprotocol/0gkit-attestation
npm i @foundryprotocol/0gkit-chain     # explorer URLs, balance, receipts, faucet
npm i @foundryprotocol/0gkit-contracts # typed contract clients + Foundry codegen

# The CLI — zero install
npx @foundryprotocol/0gkit-cli init
npx @foundryprotocol/0gkit-cli doctor

# React hooks
npm i @foundryprotocol/0gkit-react
```

```ts
import { fromEnv } from "@foundryprotocol/0gkit-wallet";
import { Storage } from "@foundryprotocol/0gkit-storage";

// fromEnv() auto-picks: KMS_KEY_ID > KEY_FILE+KEY_PASSWORD > PRIVATE_KEY
const signer = await fromEnv();
const storage = new Storage({ network: "galileo", signer });
const { root, tx } = await storage.upload(new TextEncoder().encode("gm"));
const bytes = await storage.download(root);

// "What will this cost?" — every primitive answers, every write supports dry-run
const est = await storage.estimate(new TextEncoder().encode("gm"));
const dryRun = await storage.upload(new TextEncoder().encode("gm"), { dryRun: true });
```

```bash
# Or from the CLI
0g estimate storage ./README.md
0g storage put ./README.md --dry-run
```

## Packages

| Package                                                                | What it does                                                                                                    |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [`@foundryprotocol/0gkit-core`](./packages/0gkit-core)                 | Network presets, viem client factory, `Receipt`, `ZeroGError` taxonomy. The shared base.                        |
| [`@foundryprotocol/0gkit-chain`](./packages/0gkit-chain)               | Explorer URLs, balance, `waitForReceipt`, testnet faucet.                                                       |
| [`@foundryprotocol/0gkit-storage`](./packages/0gkit-storage)           | `upload` / `download` / `computeRoot` / `exists`.                                                               |
| [`@foundryprotocol/0gkit-compute`](./packages/0gkit-compute)           | Provider discovery, broker inference, OpenAI-compatible shim.                                                   |
| [`@foundryprotocol/0gkit-da`](./packages/0gkit-da)                     | Data Availability publish + verify (canonical digest).                                                          |
| [`@foundryprotocol/0gkit-attestation`](./packages/0gkit-attestation)   | TEE attestation parse / sign / recover / verify / report.                                                       |
| [`@foundryprotocol/0gkit-contracts`](./packages/0gkit-contracts)       | Typed contract clients — 5 standard 0G contracts + `forge build` → typed TS codegen.                            |
| [`@foundryprotocol/0gkit-testing`](./packages/0gkit-testing)           | Vitest mocks, fixtures, `testWallet`, `setupLocalDevnet`, four 0G-aware matchers.                               |
| [`@foundryprotocol/0gkit-indexer`](./packages/0gkit-indexer)           | Reorg-safe event subscriptions on 0G (memory/sqlite/redis cursors).                                             |
| [`@foundryprotocol/0gkit-wallet`](./packages/0gkit-wallet)             | Node wallet loaders: `fromPrivateKey`, `fromFile`, `fromEnv`, `fromKMS`, SIWE.                                  |
| [`@foundryprotocol/0gkit-wallet-react`](./packages/0gkit-wallet-react) | React + wagmi v2: `ZeroGWalletProvider`, `useWallet`, `useConnect`, `useSwitchNetwork`.                         |
| [`@foundryprotocol/0gkit-cli`](./packages/0gkit-cli)                   | The `0g` command line — `init`, `doctor`, `chain`, `storage`, `infer`, `da`, `attest`, `contracts`, `estimate`. |
| [`@foundryprotocol/0gkit-mcp`](./packages/0gkit-mcp)                   | Every primitive as an MCP tool for Claude / Cursor / Cline / any agent.                                         |
| [`@foundryprotocol/0gkit-react`](./packages/0gkit-react)               | `useUpload` / `useDownload` / `useInference` / `useAttestation` / `useEvent` / `useLogs`.                       |

## Documentation

Full documentation — every package explained in detail, with examples and
guidance on **what / when / where** to use each — lives in the docs site:

```bash
pnpm --filter @foundryprotocol/0gkit-docs dev   # http://localhost:3000
```

It is also deployable to Vercel from `apps/docs`.

## Templates

Ready-to-clone starter projects under [`templates/`](./templates):

| Template             | Use case                                                         |
| -------------------- | ---------------------------------------------------------------- |
| `storage-app`        | Upload + download a file, print the Merkle root + tx receipt     |
| `inference-app`      | Discover a provider and run an OpenAI-compatible chat completion |
| `attestation-verify` | Parse + verify a TEE attestation report (pure crypto)            |
| `mcp-agent`          | Wire `@foundryprotocol/0gkit-mcp` into an agent runtime          |
| `react-app`          | Next.js app using the React hooks                                |

## Repository layout

```
packages/0gkit-*   the published library packages
apps/playground    zero-setup web console (private)
apps/docs          the documentation site (private, Vercel-deployable)
templates/         degit-able starter projects
```

## Community

Come build in the open — [**GitHub Discussions**](https://github.com/rajkaria/0gkit/discussions):

- **[Q&A](https://github.com/rajkaria/0gkit/discussions/categories/q-a)** — get
  unstuck. Start with the pinned _"How to ask great questions"_ post: re-run your
  failing command with `--copy-issue-context` and paste the redacted block.
- **[Show and tell](https://github.com/rajkaria/0gkit/discussions/categories/show-and-tell)** —
  what you built on 0gkit.
- **[Ideas](https://github.com/rajkaria/0gkit/discussions/categories/ideas)** —
  propose features (problem-first).
- **RFCs** — design changes to a package's public surface (additive-only, D13).
- **Show your kit** — share a kit others can `0g add`. Built one for reuse? See
  [Authoring a kit](https://0gkit.com/kits/authoring) and post it here — solid
  community kits are exactly what the general engine is for.

No paid tiers. Reach the maintainer on [Telegram](https://t.me/rajkaria) or
[X](https://x.com/rajkaria_).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Every change to a published package
needs a changeset (`pnpm changeset`). CI must be green.

## License

MIT — see [LICENSE](./LICENSE).
