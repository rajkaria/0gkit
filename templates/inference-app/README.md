# inference-app

A minimal Node + TypeScript starter that **discovers a
[0G Compute](https://0g.ai) provider and runs an OpenAI-compatible chat
completion** using
[`@foundryprotocol/0gkit-compute`](https://www.npmjs.com/package/@foundryprotocol/0gkit-compute).

## Prerequisites

- Node.js **>= 20.10**
- A funded 0G **broker** private key (pays per-inference fees).

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

| Var             | Purpose                                                       |
| --------------- | ------------------------------------------------------------- |
| `BROKER_KEY`    | Funded 0G broker key (64-char hex, `0x` optional)             |
| `PROVIDER`      | Inference provider address — leave blank to auto-discover one |
| `ZEROG_NETWORK` | `galileo` (testnet, default) or `aristotle` (mainnet)         |
| `MODEL`         | Optional model name; the provider default is used if unset    |
| `PROMPT`        | The question to ask                                           |

## Run

```bash
npm start
```

## Expected output

```
No PROVIDER set — discovering one from the 0G network…
  Using provider 0xabc1…
Asking the 0G provider: "In one sentence, what is the 0G network?"

--- answer ---
0G is a modular AI-focused blockchain providing decentralized storage, compute, and data availability.
--------------
latency 1820ms  settlement tx 0x44ad…
```

## How it works

`new Compute({ network, brokerKey, provider }).inference({ messages })`
returns `{ output, receipt }`. A drop-in OpenAI shim is also available via
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
2. **Extend to streaming** — swap `compute.inference` for `compute.inferenceStream` and pipe tokens to the client.
3. **Migrate to mainnet** — `ZEROG_NETWORK=aristotle`, top up the broker, re-run.
