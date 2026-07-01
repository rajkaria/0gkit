# 0gkit-status

A live **0G network status dashboard**, built to prove the [0gkit](https://0gkit.com)
Kits epic works end-to-end on the **published** packages — the ultimate dogfood.

## What makes it a dogfood

- **Consumes published packages.** Its `package.json` depends on
  `@foundryprotocol/0gkit-*@^1.x` from npm — **no `workspace:*`**. It lives in
  `showcase/`, outside the monorepo's pnpm workspace, so it installs and breaks
  exactly like a real user's app (mirrors Decision D24). If a published package
  regresses, this app regresses.
- **Composed from Kits.** The two interactive panels are the
  [`agent-memory`](https://0gkit.com/kits/agent-memory) and
  [`live-feed`](https://0gkit.com/kits/live-feed) kits — their portable `lib/`
  is applied into `lib/` and driven by the app's API routes, the same way
  `0g add agent-memory live-feed` composes them into any base.
- **`Compute.router()` (K7)** powers the AI summary panel — model-first, with the
  managed 0G Router when keyed and honest client-side selection otherwise.
- **`0g test` (K5)** is the CI gate (`.github/workflows/ci.yml`) — the app is a
  conformance testee.

## Honesty (the standing rule)

Every panel shows **real data or a clear "what to configure" note** — never a
fabricated number:

| Panel        | Keyless (public deploy)                    | Configured                                           |
| ------------ | ------------------------------------------ | ---------------------------------------------------- |
| 0G Network   | **live** galileo data over public JSON-RPC | same                                                 |
| AI summary   | "set `ROUTER_API_KEY` / `OG_PRIVATE_KEY`"  | real `Compute.router()` summary of the live status   |
| Pinned snaps | in-memory (says so)                        | persisted to 0G Storage (`OG_PRIVATE_KEY`)           |
| Live feed    | storage-only demo (says so)                | reorg-safe with `OG_FEED_CONTRACT_ADDRESS` + Indexer |

Galileo is the only network (no Aristotle-mainnet gating — Decision D10).

## Run locally

```bash
cd showcase/0gkit-status
npm install
cp .env.example .env      # optional — it runs keyless with live network data
npm run dev               # http://localhost:3000
npm run build             # production build
0g test --suite=storage   # the conformance gate CI runs
```

## Deploy

Any Next.js host. On Vercel: framework auto-detected (`vercel.json`), set env
from `.env.example` (all optional). Intended home: `apps.0gkit.com`.

---

Built with 0gkit · composed from kits · consumes published `@foundryprotocol/0gkit-*@^1.x`.
