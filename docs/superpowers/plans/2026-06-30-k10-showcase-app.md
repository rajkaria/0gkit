---
title: K10 — Showcase app on `apps.0gkit.com` (composed from Kits)
date: 2026-06-30
epic: kits
sprint: K10 (old SP22)
spec: ../specs/2026-06-30-0gkit-kits-design.md
roadmap: 2026-06-30-kits-epic-roadmap.md
status: ready
depends_on: [K0, K1, K2, K3, K4, K5, K7]
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

# K10 — Showcase app

## Goal

Ship **one public app** that consumes the **published** `@foundryprotocol/0gkit-*`
v1.x packages (not workspace, not a template) and is **composed by applying
Kits** — the ultimate dogfood + GTM proof. After K10:

- `0gkit-status` (a live 0G network dashboard) is deployed at
  `https://apps.0gkit.com`, built by scaffolding a base then running
  `0g add agent-memory live-feed` (and friends) — proving the Kits epic works
  end-to-end on the real published surface.
- It uses K7's `Compute.router()`, K5's `0g test` as its CI gate, and is linked
  from the landing `TrustSignals`.

> **Why this depends on K0–K4 + K5 + K7:** the central synergy is "build the
> showcase **by composing Kits**." That requires the kits epic shipped (K0–K4),
> `0g test` as the CI step (K5), and `router()` as the compute default (K7).

## Dependencies / Architecture

- **Separate Vercel project**, **not** in `pnpm-workspace.yaml` — it installs the
  **published** packages from npm exactly like a real user (mirrors D24:
  templates use published packages, never workspace). Lives in its own repo dir
  or a `showcase/` folder excluded from the workspace globs.
- **Composed from Kits:** the app is scaffolded via
  `npm create 0gkit-app@latest 0gkit-status -- --template react-app --kits agent-memory,live-feed`,
  then any extra kit applied with `0g add`. The `live-feed` kit (K2,
  `0gkit-indexer`, reorg-safe) drives the live network feed; `agent-memory` (K0)
  stores user-pinned views. This is the dogfood: if a kit breaks, the showcase
  breaks.
- **Pick the app (T1 decision):** `0gkit-status` (live network observability
  dashboard reading real galileo data — honest, always-on, no Aristotle gating
  per D10) **vs** `0gkit-prompt-receipts` (sign + verify inference receipts). The
  plan assumes `0gkit-status` (lower live-data risk, showcases `live-feed` +
  `router()` + observability). Decide at T1; the rest of the plan is app-agnostic.
- **Compute** uses K7's `Compute.router()` (default in the composed kits).
- **CI** uses K5's `0g test` as the conformance gate before deploy.
- **Deploy** to Vercel as `apps.0gkit.com`; link from
  `apps/landing/components/TrustSignals.tsx` (on the 0gkit repo).
- **Multi-PR**: scaffold → MVP → polish → deploy. Each PR squash-merged.

## Tech Stack

Next.js (react-app base), published `@foundryprotocol/0gkit-*@^1.x`, the K2
`live-feed` + K0 `agent-memory` kits, `Compute.router()` (K7), Vercel. CI: `0g test`.

## Working dir / Branch

- Working dir: `/Users/rajkaria/Projects/0G-ai-kit` (landing-link + docs changes
  land here; the showcase app itself lives in its own non-workspace dir / repo).
- Branch: `kits-k10-showcase-app` off `main`

## File structure

**Created** (showcase app — its own dir, NOT a workspace package)
```
showcase/0gkit-status/
  package.json               # published @foundryprotocol/0gkit-*@^1.x deps (no workspace:*)
  0g.config.ts               # define0GConfig (galileo default)
  app/page.tsx               # network dashboard shell
  app/api/feed/route.ts      # from live-feed kit adapter (K2)
  lib/                       # agent-memory + live-feed kit lib (applied via 0g add)
  .github/workflows/ci.yml   # runs `0g test` (K5) as the gate
  vercel.json
  README.md
```

**Modified** (on the 0gkit repo)
```
apps/landing/components/TrustSignals.tsx   # link the live showcase
apps/docs/app/kits/page.mdx                # "Built with Kits: 0gkit-status" callout
.changeset/k10-showcase.md                  # (docs/landing only — app isn't a published pkg)
docs/DECISIONS.md                           # D91–D92
```

## Task graph

```
PR1  T1 pick app + scaffold from kits (0g create + 0g add)
        │
PR2  T2 MVP: live feed (live-feed kit) + router() compute + memory pins
        │
PR3  T3 polish: define0GConfig, error boundary → defect-report, 0g test CI gate
        │
PR4  T4 deploy to apps.0gkit.com + landing TrustSignals link + docs callout
        │
     T5 changeset (docs/landing) + D91–D92
```

---

## Tasks

### PR1 — T1: pick the app + scaffold by composing kits

- [ ] **Decide** — `0gkit-status` (assumed) vs `0gkit-prompt-receipts`. Record the choice + one-line rationale in `showcase/0gkit-status/README.md`. Honesty: `0gkit-status` reads **real galileo** data; if a panel can't fetch live, it shows "no live data" — never fabricated numbers.
- [ ] **Scaffold** — run, from a clean dir outside the workspace:
```bash
npm create 0gkit-app@latest 0gkit-status -- \
  --template react-app --kits agent-memory,live-feed
```
  Confirm the scaffold installs **published** `@foundryprotocol/0gkit-*@^1.x`
  (grep `package.json` for any `workspace:*` — there must be none, per D24).
- [ ] **Verify** — `npm run dev` boots; the `live-feed` + `agent-memory` kit files
  are present (`lib/`, `app/api/feed/route.ts`).
- [ ] **Commit** (PR1): `feat(showcase): scaffold 0gkit-status by composing agent-memory + live-feed kits`.

### PR2 — T2: MVP (live feed + router compute + memory pins)

- [ ] **Failing test** — `showcase/0gkit-status/app/api/feed/__tests__/feed.test.ts`: the feed route returns reorg-safe events from the `live-feed` kit lib (injected indexer); a compute-backed summary uses `Compute.router({ model })` (K7), not a hard-coded provider; a "pin this view" action persists through the `agent-memory` kit lib.
- [ ] **Run** → red.
- [ ] **Implement** — wire the dashboard: (a) live network feed via the `live-feed` kit's lib (`0gkit-indexer`, reorg-safe); (b) an AI summary panel calling `Compute.router({ model: "llama-3.1-8b", messages })`; (c) "pin" persistence via `agent-memory`'s `createMemory({ storage, namespace })`. Galileo default; no Aristotle gating (D10).
- [ ] **Run** → green. **Commit** (PR2): `feat(showcase): live feed + router() summary + agent-memory pins`.

### PR3 — T3: polish (config + error boundary + CI gate)

- [ ] **Implement** — `0g.config.ts` via `define0GConfig` (galileo default, `.env.example` generated); a React error boundary that, on a `ZeroGError`, renders the `buildDefectReport()` output (the shipped defect-report feature) so the showcase is the cleanest testee; `.github/workflows/ci.yml` runs `0g test` (K5) as the gate before any deploy.
- [ ] **Run** — `0g test` green against galileo; `npm run build` succeeds.
- [ ] **Commit** (PR3): `feat(showcase): define0GConfig + defect-report error boundary + 0g test CI gate`.

### PR4 — T4: deploy + landing link + docs callout

- [ ] **Deploy** — Vercel project for `showcase/0gkit-status`, custom domain
  `apps.0gkit.com`. Set env from `.env.example`. Verify the live URL renders real
  galileo data.
- [ ] **Implement** — on the 0gkit repo: add the live link to
  `apps/landing/components/TrustSignals.tsx` ("Built with 0gkit Kits — live"),
  and a callout in `apps/docs/app/kits/page.mdx` ("0gkit-status is built by
  composing the `agent-memory` + `live-feed` kits — see it live").
- [ ] **Run** — landing `pnpm build` + `pnpm docs:check` green; the deployed URL is
  reachable (smoke-check the home route).
- [ ] **Commit** (PR4): `feat(landing): link the live 0gkit-status showcase; docs callout`.

### T5 — changeset (docs/landing) + decisions

- [ ] **Implement** — `.changeset/k10-showcase.md`: landing + docs only (the
  showcase app is **not** a published package, so no package version bump). If the
  landing app is versioned in the changeset graph, mark it patch.
- [ ] **Implement** — `docs/DECISIONS.md` D91–D92:
  - **D91** — The showcase consumes **published** `@foundryprotocol/0gkit-*@^1.x`
    and is **not** in the workspace (mirrors D24) — it must break exactly like a
    real user's app if a published package or kit regresses.
  - **D92** — The showcase is **composed from Kits** (`0g add agent-memory
    live-feed`), uses `Compute.router()` (K7) and `0g test` (K5) as its CI gate —
    it is the epic's end-to-end dogfood + GTM proof. `0gkit-status` reads real
    galileo data and shows "no live data" rather than fabricating (honesty rule).
- [ ] **Commit**: `chore(k10): changeset + D91–D92`.

## Self-review checklist

- [ ] App installs **published** packages — zero `workspace:*` in its `package.json` (D24).
- [ ] App is **composed via `0g add`** — kit files present, not hand-rolled (dogfood).
- [ ] Compute uses `Compute.router()` (K7), not a hard-coded provider.
- [ ] `0g test` (K5) is the CI gate before deploy.
- [ ] All data is real galileo; missing live data shows "no live data", never fabricated (honesty + D10).
- [ ] Error boundary surfaces `buildDefectReport()` so the showcase is the cleanest testee.
- [ ] Deployed at `apps.0gkit.com`; linked from landing TrustSignals + docs `/kits` callout.
- [ ] Multi-PR (scaffold → MVP → polish → deploy), each squash-merged; D91–D92 recorded.
