# inference-app

A minimal Node + TypeScript starter that **routes to a
[0G Compute](https://0g.ai) provider and runs an OpenAI-compatible chat
completion** using `Compute.router()` from
[`@foundryprotocol/0gkit-compute`](https://www.npmjs.com/package/@foundryprotocol/0gkit-compute) —
no hard-coded provider address.

## Prerequisites

- Node.js **>= 20.10**
- Either a **0G Router API key** (`ROUTER_API_KEY`, from
  [pc.0g.ai](https://pc.0g.ai)) for the managed Router, **or** a funded 0G
  **broker** private key (`BROKER_KEY`) for client-side routing.

## Clone

```bash
npx degit rajkaria/0gkit/templates/inference-app inference-app
cd inference-app
npm install
```

## Setup

```bash
cp .env.example .env
```

| Var              | Purpose                                                              |
| ---------------- | ------------------------------------------------------------------- |
| `BROKER_KEY`     | Funded 0G broker key (64-char hex) — used for client-side routing   |
| `ROUTER_API_KEY` | 0G Router API key (pc.0g.ai) — set to use the managed Router        |
| `PROVIDER`       | Pin a provider address — leave blank and the router picks one       |
| `ZEROG_NETWORK`  | `galileo` (testnet, default) or `aristotle` (mainnet)               |
| `MODEL`          | Model name; required with `ROUTER_API_KEY`, else provider default   |
| `PROMPT`         | The question to ask                                                 |

## Run

```bash
npm start
```

## Expected output

```
Asking the 0G network: "In one sentence, what is the 0G network?"

--- answer ---
0G is a modular AI-focused blockchain providing decentralized storage, compute, and data availability.
--------------
latency 1820ms  settlement tx 0x44ad…
```

## How it works

`new Compute({ network, brokerKey, routerApiKey }).router({ messages })`
picks a provider for you — the managed **0G Router** endpoint when
`ROUTER_API_KEY` is set, otherwise **client-side** selection over the on-chain
provider list with retry/fallback — and returns `{ output, receipt }`. Pass
`{ prefer }` to pin a provider, or call `compute.direct({ provider, messages })`
if you own a provider relationship. A drop-in OpenAI shim is also available via
`compute.openai().chat.completions.create(...)`. See
[`src/index.ts`](./src/index.ts).

## Docs

- 0gkit: <https://github.com/rajkaria/0gkit>
- 0G Compute: <https://docs.0g.ai>

## Deploy on Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Frajkaria%2F0gkit%2Ftree%2Fmain%2Ftemplates%2Finference-app&project-name=0gkit-inference-app&env=NETWORK%2CPRIVATE_KEY&envDescription=See%20docs.0gkit.com%20env%20vars&envLink=https%3A%2F%2Fdocs.0gkit.com%2Fgetting-started%2Fenv-vars)

Vercel will fork the template into a new repository, prompt for the listed
env vars, and deploy in under 60 seconds on Fluid Compute.

## What next?

1. **Deploy as a cron** — wrap `main()` in a Vercel Cron route; persist the result to KV or 0G Storage.
2. **Use the managed Router** — set `ROUTER_API_KEY` (pc.0g.ai) for server-side selection, failover, and a single pre-funded balance.
3. **Migrate to mainnet** — `ZEROG_NETWORK=aristotle`, top up the broker (or Router balance), re-run.
