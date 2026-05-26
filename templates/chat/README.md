# chat — real-time chat on 0G

A working chat app where every message is persisted to **0G Storage** and the
on-chain `MessagePosted` event log is the source of truth for the message list.

Stack: Next.js 16 App Router · React 19 · `@foundryprotocol/0gkit-storage` ·
`@foundryprotocol/0gkit-indexer` · `@foundryprotocol/0gkit-react` ·
`@foundryprotocol/0gkit-contracts`.

## What this demos

| Surface             | Used for                                                  |
| ------------------- | --------------------------------------------------------- |
| SP3 wallet (server) | Signs the upload + the `post(root, ts)` tx                |
| SP4 typed contracts | `createTypedContract(...).write.post(...)`                |
| SP6 indexer (react) | `useEvent({ contract, event: "MessagePosted" })`          |
| SP3 storage         | `storage.upload(encodeMessage(...))` + `storage.download` |

## Quickstart

```bash
cp .env.example .env
# Fill in PRIVATE_KEY (galileo testnet faucet at https://faucet.0g.ai).

pnpm install
# (Optional but recommended for local dev: in another terminal, run `0g dev`
#  to boot a local 0G stack and deploy the MessageRegistry contract.)
pnpm dev
# Open http://localhost:3000
```

## Walk through the code

1. **`lib/message.ts`** — message codec. Pure functions. Encodes/decodes the
   wire format: `{ v: 1, author, ts, body }`. Validates the address shape and
   clamps body size to 4 KiB. This is the unit-tested surface.

2. **`app/api/post/route.ts`** — server-side write path.
   - `POST /api/post` encodes the message, uploads to 0G Storage, then calls
     `MessageRegistry.post(root, ts)` via `createTypedContract`.
   - `GET /api/post?root=…` proxies the storage download (so the browser
     doesn't need the signer).

3. **`app/page.tsx`** — the UI.
   - `useEvent` from `0gkit-react` subscribes to `MessagePosted` events with
     reorg-safe semantics (rolled-back events disappear automatically).
   - For each event row we fetch the stored bytes from `/api/post?root=…` and
     decode them into a body.

4. **`app/providers.tsx`** — constructs and starts a single `Indexer` per
   network, wraps the app in `ZeroGIndexerProvider` so all hooks share the
   same polling instance.

## Deploy the MessageRegistry contract

The contract is 30 lines of Solidity:

```solidity
pragma solidity ^0.8.20;
contract MessageRegistry {
    event MessagePosted(address indexed author, bytes32 root, uint256 ts);
    function post(bytes32 root, uint256 ts) external {
        emit MessagePosted(msg.sender, root, ts);
    }
}
```

Deploy with `forge create`, Hardhat, or `0g dev` (which deploys it
automatically on a local devnet). Paste the address into
`NEXT_PUBLIC_MESSAGE_REGISTRY_ADDRESS`.

## Run the tests

```bash
pnpm test
```

Six tests cover the wire-format codec at 100% lines / ≥ 80% branches. No
network needed.

## Deploy on Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Frajkaria%2F0gkit%2Ftree%2Fmain%2Ftemplates%2Fchat&project-name=0gkit-chat&env=NETWORK%2CPRIVATE_KEY&envDescription=See%20docs.0gkit.com%20env%20vars&envLink=https%3A%2F%2Fdocs.0gkit.com%2Fgetting-started%2Fenv-vars)

Vercel will fork the template into a new repository, prompt for the listed
env vars, and deploy in under 60 seconds on Fluid Compute.

## What next?

1. **Deploy** — `vercel deploy`. Configure `PRIVATE_KEY` + `NEXT_PUBLIC_MESSAGE_REGISTRY_ADDRESS` in the Vercel dashboard.
2. **Extend** — per-room channels by emitting `MessagePosted(author, root, ts, room)` and filtering `useEvent` by `args.room`; client-side signing via `0gkit-wallet-react` once you don't need a privileged server key; long uploads on `@foundryprotocol/0gkit-jobs`.
3. **Migrate to mainnet** — deploy `MessageRegistry` to aristotle, paste its address into both env files, redeploy.
