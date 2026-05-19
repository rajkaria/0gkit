# storage-app

A minimal Node + TypeScript starter that **round-trips a file through
[0G Storage](https://0g.ai)** using
[`@foundryprotocol/0gkit-storage`](https://www.npmjs.com/package/@foundryprotocol/0gkit-storage).

It uploads a local file, prints the Merkle root and funding-tx receipt,
downloads the blob back by root, and verifies the bytes match exactly.

## Prerequisites

- Node.js **>= 20.10**
- A funded private key on the chosen 0G network. For the `galileo` testnet,
  get free funds at <https://faucet.0g.ai>.

## Clone

```bash
npx degit rajkaria/0G-ai-kit/templates/storage-app storage-app
cd storage-app
npm install
```

## Setup

```bash
cp .env.example .env
```

Then edit `.env`:

| Var             | Purpose                                                         |
| --------------- | --------------------------------------------------------------- |
| `PRIVATE_KEY`   | Funded key that pays the upload tx (64-char hex, `0x` optional) |
| `ZEROG_NETWORK` | `galileo` (testnet, default) or `aristotle` (mainnet)           |

## Run

```bash
npm start
```

## Expected output

```
Read 1843 bytes from /…/storage-app/src/index.ts
Uploading to 0G Storage (galileo)…
  Merkle root : 0x9a3b…
  tx hash     : 0x71c2…
  latency     : 4213ms
Downloading 0x9a3b… back…
  Got 1843 bytes
Round-trip OK: downloaded bytes match the original.
```

## How it works

`new Storage({ network, privateKey })` → `.upload(bytes)` returns
`{ root, tx }`; `.download(root)` returns the bytes back. See
[`src/index.ts`](./src/index.ts).

## Docs

- 0gkit: <https://github.com/rajkaria/0G-ai-kit>
- 0G Storage: <https://docs.0g.ai>
