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
npx degit rajkaria/0G-ai-kit/templates/inference-app inference-app
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

- 0gkit: <https://github.com/rajkaria/0G-ai-kit>
- 0G Compute: <https://docs.0g.ai>
