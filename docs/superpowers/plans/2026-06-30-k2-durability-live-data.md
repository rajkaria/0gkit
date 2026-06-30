---
title: K2 — durable-agent + live-feed kits
date: 2026-06-30
epic: kits
sprint: K2 (proposed SP19)
spec: ../specs/2026-06-30-0gkit-kits-design.md
status: ready
depends_on: K0 (engine), K1 (ai-oracle reused by durable-agent demo step is optional)
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

# K2 — `durable-agent`, `live-feed`

## Goal

Ship the two **categories create-0g-dapp structurally lacks**: durability and
reorg-safe live data. `durable-agent` runs a resumable agent loop on
`0gkit-jobs` (survives restarts, retries, step ledger, traced via
`0gkit-observability`). `live-feed` is a reorg-safe event/social feed on
`0gkit-indexer`.

## Dependencies (already shipped)

- **K0** engine; **K1** kits (optional: `durable-agent`'s sample task can call a
  `sealed-inference` step if present, guarded behind a capability check — not a
  hard `composes`).
- `0gkit-jobs` (durable runner, SQLite + memory backends), `0gkit-observability`
  (OTel + `OGKIT_TRACE_DIR` local sink, D58), `0gkit-indexer` (reorg-safe events,
  SP6-era).

## Architecture

- `durable-agent` lib defines job + step types and a runner factory over
  `0gkit-jobs`; adapters expose enqueue/inspect (API) and a control MCP tool.
  Each step is traced; the step ledger is the durability proof.
- `live-feed` lib writes posts/events to 0G Storage and reads them back via the
  indexer's reorg-safe cursor; React UI renders a live-updating feed.

## Working dir / Branch

- Working dir: `/Users/rajkaria/Projects/0G-ai-kit`
- Branch: `kits-k2-durability` (off `main` after K1 merges)

## File structure (Created)

```
templates/_kits/durable-agent/
  kit.json
  lib/agent.ts                          # job + step defs, runner factory over 0gkit-jobs
  lib/steps.ts                          # sample multi-step pipeline (research → act → record)
  adapters/react-app/app/api/agent/route.ts     # enqueue + status
  adapters/tee-attested-api/src/routes/agent.ts
  adapters/mcp-agent/src/tools/agent.ts          # start/inspect/cancel run
  lib/__tests__/agent.test.ts
templates/_kits/live-feed/
  kit.json
  lib/feed.ts                           # post() to storage, stream() via indexer cursor
  adapters/react-app/app/api/feed/route.ts
  ui/app/feed/page.tsx
  ui/components/FeedStream.tsx          # live list, reorg-aware (drops orphaned)
  ui/hooks/useLiveFeed.ts
  lib/__tests__/feed.test.ts
```

**Modified**: `.changeset/kits-durability.md`.

## Task graph

```
T1 durable-agent (lib + adapters)
T2 live-feed (lib + adapters + ui)      ← parallel-safe with T1
        └───────────┬───────────┘
                    ▼
        T3 kits:check + docs stubs + changeset
```

---

## Tasks

### T1 — `durable-agent` kit

- [ ] **Failing test** — `lib/__tests__/agent.test.ts`: enqueue a 3-step job against an
  **in-memory `0gkit-jobs` backend**; assert (a) all steps run in order, (b) on an injected
  crash after step 2, resuming the runner **does not re-run** steps 1–2 (ledger replay), and
  (c) each step emits a span (assert against an injected tracer).
- [ ] **Run** → red.
- [ ] **Implement** — `lib/agent.ts`: `defineAgent({ steps })` + `createRunner({ jobs, tracer })`
  with idempotent step keys persisted to the jobs ledger; `lib/steps.ts` sample pipeline.
  `kit.json`: `domain:"agent-infra"`, `compatibleBases:["react-app","chat","tee-attested-api","mcp-agent","storage-app"]`,
  `requires:["0gkit-jobs","0gkit-observability"]`, lib + 3 adapters, no UI.
- [ ] **Run** → green. **Commit**: `feat(kits): durable-agent (resumable loop on 0gkit-jobs)`.

### T2 — `live-feed` kit

- [ ] **Failing test** — `lib/__tests__/feed.test.ts`: `post(msg)` writes a storage blob and
  returns a cursor entry; `stream()` over an injected indexer yields posts in order and, on an
  injected reorg event, **drops the orphaned post** from the emitted stream.
- [ ] **Run** → red.
- [ ] **Implement** — `lib/feed.ts` (storage write + indexer reorg-safe cursor read).
  `kit.json`: `domain:"markets"`, `compatibleBases:["react-app","chat"]`,
  `requires:["0gkit-storage","0gkit-indexer"]`, lib + react adapter + UI.
- [ ] **Run** → green. **Commit**: `feat(kits): live-feed (reorg-safe live feed on 0gkit-indexer)`.

### T3 — matrix check + docs stubs + changeset

- [ ] **Run** — `pnpm kits:check` for the two new kits × bases → green.
- [ ] **Implement** — `apps/docs/app/kits/{durable-agent,live-feed}/page.mdx` stubs.
- [ ] **Implement** — `.changeset/kits-durability.md`.
- [ ] **Run** — full gate → green. **Commit** + PR `K2 — durability + live data`. Squash-merge on green.

## Self-review checklist

- [ ] `durable-agent` resume does NOT re-run completed steps (ledger replay proven by test).
- [ ] Every `durable-agent` step is traced (assert against injected tracer).
- [ ] `live-feed` drops orphaned posts on reorg (proven by test) — not just append-only.
- [ ] No `@foundryprotocol/*` app imports (boundary:check green).
- [ ] `durable-agent`'s optional `sealed-inference` step is capability-guarded, not a hard dep.
- [ ] All combos typecheck+build via `kits:check`.
