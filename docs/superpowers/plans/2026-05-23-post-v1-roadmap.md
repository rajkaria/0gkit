---
title: Post-v1 0gkit roadmap (SP13–SP25)
date: 2026-05-23
status: draft
supersedes_carryover: foundry-sdk-refresh, showcase-app, jaeger (in-flight PR #42), community-surface
---

# Post-v1 0gkit roadmap

Consolidates the four open carryover items (CLAUDE.md) with the 13-item P0/P1/P2 backlog the user submitted on 2026-05-23. Items have been **analysed for value**, **clubbed where they share infra**, and **reordered** by cost-to-value and dependency direction.

## TL;DR — what changed vs the input list

| Input item                            | Verdict                                                                                                                                             | Action                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| #17 Error pages                       | **Already done** — 45 pages live since SP9, every code has cause/fix/example.                                                                       | Move to SP19 polish ("copy issue context" CLI output is the only gap).                   |
| #16 Contract registry                 | **Mostly done** — `0g contracts generate/list/info` shipped in SP4 with `standardContracts.{erc20,erc721,multicall3,registry,attestationVerifier}`. | One follow-up only: `0g contracts import <address-or-abi>` (chain-explorer ABI fetcher). |
| #5 CLI cold-start                     | **Partially done** — D39 lazy-loaded `0gkit-jobs` via computed specifier; better-sqlite3 no longer in CLI deps.                                     | Add CI benchmark + small audit pass.                                                     |
| #1 Docs cleanup + #14 Migration guide | Same surface (MDX edits + version-sync CI gate).                                                                                                    | **Clubbed** as SP13.                                                                     |
| #4 Compute Router + #11 MCP init      | Both are DX/integration tooling, both touch templates.                                                                                              | **Clubbed** as SP19.                                                                     |
| #15 Trace explorer                    | The in-flight PR #42 (`0g cost forecast --from-jaeger`) is half of this. Local `.0gkit/traces` is the other half.                                   | **Clubbed** as SP15 follow-up to PR #42.                                                 |
| #2 Golden path + #12 Typed config     | Golden path is "every template runs in 5 min"; typed config is "every template uses `define0GConfig`". Same per-template touch.                     | **Clubbed** as SP16.                                                                     |
| #3 `doctor --fix` + #9 `0g test`      | Both extend `doctor` semantics (one writes config, one runs conformance).                                                                           | **Clubbed** as SP17.                                                                     |
| Foundry SDK refresh (carryover)       | Cross-repo, no urgency; user just deferred this session.                                                                                            | SP23 — last sprint.                                                                      |
| Showcase app (carryover)              | High-impact but blocked on the trust/golden-path stories landing first.                                                                             | SP24.                                                                                    |
| Community surface (carryover)         | Config-only, fits anywhere.                                                                                                                         | SP25 — drop-in.                                                                          |

**Net:** the 13-item input + 4-item carryover = **13 sprints** (SP13–SP25), batched into four themed waves.

## Wave A — Trust & truth (low-friction trust wins)

### SP13 — Docs cleanup + migration guide + version-sync CI gate

Clubs **#1** + **#14** + closes #5's CI-benchmark hook.

- Audit every MDX page + every template README for: `0.x.0` version refs, `npx 0g` (without scope), legacy `@0gfoundation/*` mentions, stale curl commands.
- Replace with canonical: `npm create 0gkit-app@latest`, `npx @foundryprotocol/0gkit-cli`, current published versions read from npm registry at build time (extend the `getLatestRelease()` pattern from PR #37).
- Add `pnpm docs:check --versions` that fails CI if any MDX file contains a hardcoded `@foundryprotocol/0gkit-*@<version>` pin lower than the current `package.json` version.
- New `apps/docs/app/migrate-from-official-sdks/page.mdx` — three side-by-side blocks: storage SDK → 0gkit-storage, compute SDK → 0gkit-compute (Router + Direct), DA → 0gkit-da. Real install + before/after diff per primitive.
- Sidebar nav: new "Migration" section under Guides.
- CI: `0g --help` cold-start benchmark in `.github/workflows/perf-benchmark.yml` — fails if `time 0g --help` p95 > 5s on Node 22. Stored as a baseline JSON per commit.

**Effort:** 1 PR. ~2 days of focused work.

### SP14 — Land PR #42 + ship `0g traces` local explorer

Clubs **PR #42 in-flight** + **#15**.

- Squash-merge PR #42 (`--from-jaeger`). Already CI-ready.
- Extend `0gkit-observability`: when `OGKIT_TRACE_DIR` env is set (default unset), spans are mirrored to `.0gkit/traces/<date>-<traceId>.jsonl` in addition to the configured exporter. Pure local sink — no network.
- New `0g traces list [--last N]` — read trace files, summarise per trace: spans count, total fee, top op.
- New `0g traces inspect <traceId>` — pretty-print one trace's spans, fees, attributes; `--json` for piping into `0g cost forecast --from-jaeger` directly.
- Docs: extend the SP13 CLI reference's `0g cost` section.

**Effort:** 1 PR after PR #42 lands.

### SP15 — Error page polish + "copy issue context" CLI output

Pulls forward **#17 remaining piece**.

- All 45 error pages already cover cause/fix/example. Audit for: stale package versions, dead repro commands. (One pass with the SP13 version-sync gate.)
- New CLI flag `0g <any-cmd> --copy-issue-context` — on a thrown ZeroGError, dumps a markdown block with: error code, message, hint, CLI args (redacted of keys), node + OS versions, package versions, last 10 traceback frames, link to the docs page. Designed to paste straight into a GitHub issue.
- Update `apps/docs/app/errors/page.mdx` index header: "Stuck? Run with `--copy-issue-context` and paste into a new issue."

**Effort:** 1 small PR. Low.

## Wave B — Golden path + config + doctor

### SP16 — Golden path + typed config across all 9 templates

Clubs **#2** + **#12**.

- New `define0GConfig` in `0gkit-core`: typed config builder with zod env validation. Three slots: `server`, `client`, `edge` (each filters env access).
- Every template adopts `define0GConfig` in `app.config.ts` (or `0g.config.ts`). Templates ship with `.env.example` matching the schema.
- Every template:
  - Has working `npm run dev` (verify each — likely some don't).
  - Auto-detects local devnet via `0g doctor --json | jq .checks` at boot; falls back to galileo with a clear console note.
  - First-success banner — when the first 0G op completes (storage root / inference response / DA commitment / tx hash), print a boxed terminal block: `✓ First 0G action successful — <op> — <id>`.
  - `README.md` ends with a "What next?" section: 3 concrete next steps (deploy / extend / migrate to mainnet).
- Update `apps/docs/app/templates/page.mdx` — "Under 5 minutes" promise per template, with the actual measured time from CI.
- CI: extend `fresh-machine-smoke.yml` to assert the first-success banner appears in template `npm run dev` output for at least storage-app + chat templates.

**Effort:** 1 PR. Medium — touches every template but pattern is mechanical.

### SP17 — `0g doctor --fix` + `0g test` conformance runner

Clubs **#3** + **#9**.

- `0g doctor --fix`:
  - Missing `.env` → generate `.env.example` + `.env.local` from `define0GConfig` schema.
  - Stale `@foundryprotocol/0gkit-*` pins → npm-install latest in the current project.
  - Unreachable galileo RPC/indexer/encoder → suggest `0g dev` local fallback + print the exact command.
  - Each check prints `→ run \`<cmd>\` to fix`even when`--fix` not passed (currently doctor only diagnoses).
- `0g test [--suite=storage,compute,da,wallet] [--local|--galileo]` — conformance runner:
  - storage: upload 1KB, download, assert byte-equality.
  - compute: inference with a 4-token prompt, assert non-empty output.
  - da: publish + verify digest round-trip.
  - wallet: sign + recover a test envelope.
  - Each suite is a sub-test of `0gkit-testing`'s conformance pack; `0g test` lazy-imports the package via computed specifier (D39 pattern, keeps CLI cold-start fast).
  - Default suite = all four. `--local` uses `0g dev` infra; `--galileo` uses the live network.
- Templates pick up `0g test` in their `package.json` scripts as the canonical CI step.

**Effort:** 1 PR. Medium — but mostly assembly from existing primitives.

## Wave C — Native to AI tooling + Compute Router

### SP18 — `0g mcp init <agent>` for cursor/claude/windsurf/codex

Picks up **#11**.

- `0gkit-mcp` already exists (SP12-era). Wire `0g mcp init <agent>`:
  - `cursor` → writes `.cursor/mcp.json` with the 0gkit-mcp server entry.
  - `claude` → writes `~/.config/claude-code/mcp.json` (or project `.mcp.json`) — both desktop + Claude Code variants.
  - `windsurf` → `.windsurf/mcp.json`.
  - `codex` → `.codex/mcp.json`.
- Each config exposes the full 0gkit tool set: `storage_upload`, `compute_inference`, `da_publish`, `doctor`, `test`, `traces_inspect`, `cost_forecast`.
- `--global` flag installs to the agent's user-level config; default is project-scoped.
- New `apps/docs/app/concepts/mcp/page.mdx` — "Make 0gkit native to your AI tool" — per-agent quick start.

**Effort:** 1 PR. Medium.

### SP19 — First-class Compute Router

Picks up **#4**.

- **Research first:** 0G's "Router" path is the abstraction layer above per-provider selection. Confirm public API with 0G compute team / serving docs before designing surface. (Block 1 day for spec.)
- New `Compute.router({ model })` API — picks a provider behind the scenes, handles routing + retries + fallback. Defaults to "best available" per model.
- Existing `Compute.inference({ provider, ... })` renamed internally to `Compute.direct()` (alias kept for back-compat with v1.0.x). Templates default to `Compute.router()`.
- New `apps/docs/app/concepts/compute-router-vs-direct/page.mdx` — when to use each, latency/cost trade-offs.
- `0g test --suite=compute` defaults to router mode; `--direct` flag for the legacy path.

**Effort:** 1 PR. Medium-high (depends on 0G Router API stability).

## Wave D — Contracts polish + carryover

### SP20 — `0g contracts import <address|abi>`

Picks up **#16's last gap**.

- New CLI subcommand: given an EVM address on aristotle/galileo, fetch the contract's verified ABI from the chain explorer (chainscan.0g.ai API), run the existing SP4 codegen, write a typed client to `./0gkit/contracts/<name>.ts`.
- Also accept raw `--abi <path>.json` for off-chain ABIs (matches `0g contracts generate`).
- `0gkit-contracts` gains a `fetchExplorerAbi(address, network)` helper.
- Docs: extend `apps/docs/app/packages/0gkit-contracts/page.mdx` with import flow.

**Effort:** 1 PR. Medium.

### SP21 — Foundry SDK refresh onto `@foundryprotocol/0gkit-* ^1.0.x`

Picks up **carryover #1** (deferred this session).

- Refactor `Foundryprotocol/packages/sdk`:
  - `storage.ts` → thin adapter over `@foundryprotocol/0gkit-storage`'s `Storage`. Preserve `StorageClient` public API (per-call `signer`, `{ rootHash, txHash, size }` envelope, `uploadJson`/`uploadText`/`downloadJson`/`downloadText` helpers).
  - `attestation.ts` → re-export from `@foundryprotocol/0gkit-attestation`; wrap `verifyEnvelope` to keep the throw-on-mismatch semantic.
  - `da.ts` → already delegates to `0gkit-da`. No work.
  - `inference.ts` → keep (Foundry-specific proxy with revenue routing).
- Drop `@0gfoundation/0g-storage-ts-sdk` + `ethers` from peerDeps (now transitive via `0gkit-storage`).
- Bump `@foundryprotocol/sdk` to `1.1.0` (minor — API preserved).
- Cross-repo PR sequence: Foundry repo SDK PR → ship `@foundryprotocol/sdk@1.1.0` → consumers pin.

**Effort:** 1 PR on Foundryprotocol repo. Medium. (Note: aborted mid-implementation this session; storage adapter draft is in this session's transcript and can be lifted.)

### SP22 — Showcase app on `^1.0.x`

Picks up **carryover #2**.

- One public app consuming the published packages — **not** workspace, **not** a template. E.g. "0gkit-status" (live network observability dashboard reading from real Galileo traces) or "0gkit-prompt-receipts" (sign + verify inference receipts on-chain).
- Deploy to Vercel as a separate project (`apps.0gkit.com` subdomain).
- Link prominently from landing `apps/landing/components/TrustSignals.tsx`.
- Use SP19's `Compute.router()`, SP14's `.0gkit/traces`, SP20's `define0GConfig` — proves the v1.x surface end-to-end.

**Effort:** Multi-PR (scaffold → MVP → polish → deploy). 3–5 days.

### SP23 — Community surface

Picks up **carryover #4**.

- Enable GitHub Discussions on `rajkaria/0gkit`.
- Categories: Q&A / Show and tell / Ideas / RFCs. Seed each with a welcome post + one example.
- Pin a "How to ask great questions" post pointing to the `--copy-issue-context` flow from SP15.
- Add a "Community" section to `apps/landing/components/Footer.tsx` linking Discussions + the existing Telegram.
- Optional: Discord server with topic channels matching the package boundaries (storage / compute / da / wallet / observability). Defer if Discussions traction is enough.

**Effort:** Config + 1 small landing PR. Low.

## Sequence + dependency graph

```
SP13 (docs cleanup + version gate)            ←── prereq for SP16, SP22
   ↓
SP14 (land PR #42 + 0g traces)                ←── prereq for SP22 showcase
   ↓
SP15 (error polish + --copy-issue-context)
   ↓
SP16 (golden path + typed config)             ←── prereq for SP17, SP22
   ↓
SP17 (doctor --fix + 0g test)                 ←── prereq for SP22 CI
   ↓
SP18 (MCP init)                               (independent — can ship in parallel with C)
SP19 (Compute Router)                         (research-gated; parallel-safe with SP18)
   ↓
SP20 (contracts import)
SP21 (Foundry SDK refresh)                    (cross-repo, parallel-safe)
SP22 (showcase app)                           (uses everything from A + B + C)
SP23 (community)                              (drop-in, anytime)
```

## Decisions to capture as we ship

- **D58 (planned):** `OGKIT_TRACE_DIR` env opts in to local trace mirroring. Off by default (privacy). When set, `0gkit-observability` writes JSONL alongside the OTel exporter, never replaces it.
- **D59 (planned):** `define0GConfig` is in `0gkit-core` not a new package — keeps the install graph flat and validates the same way everywhere (CLI, templates, MCP server).
- **D60 (planned):** `Compute.router()` becomes the default in templates; `Compute.direct()` is kept and documented for "I have my own provider relationships." No deprecation of direct.
- **D61 (planned):** `0g test` lazy-imports `0gkit-testing` via computed specifier (D39 pattern) — keeps CLI cold-start under the SP13 budget.

## Out of scope (deliberately)

- **Mainnet timing dependency** — D10 still holds. No CLI behaviour gated on Aristotle being live for any specific operation; galileo + local devnet must always work.
- **Aggressive package renames / scope changes** — `@foundryprotocol/0gkit-*` and `0gkit` repo name stay through this roadmap (D13).
- **0gkit Discord premium tiers / paid community surface** — never. Discussions + optional Discord is the ceiling.
