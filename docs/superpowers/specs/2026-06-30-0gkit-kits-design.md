---
title: 0gkit Kits — drop-in feature kits for 0G apps
date: 2026-06-30
status: approved-pending-review
epic: kits
sprints: K0–K4 (proposed SP17–SP21)
neutrality: hard-invariant (engine + kits must not statically depend on @foundryprotocol/* app packages)
---

# 0gkit Kits

**Kits are composable, multi-framework feature overlays you add to any 0gkit app.**
One command — at scaffold time or later — drops a working, *typed*, *upgradeable* feature
(prediction market, attested private inference, durable agent, live feed, …) onto your
project, wired to your installed `@foundryprotocol/0gkit-*` packages.

```bash
# at scaffold time
npm create 0gkit-app@latest my-app -- --template react-app --kits prediction-market,agent-memory

# or later, into an existing project
0g add prediction-market
0g kits list
0g kits info sealed-inference
```

The pun is the brand: **0gkit → kits.** Tagline: *"0gkit Kits — drop-in feature kits for your 0G app."*

---

## 1. Why — and why ours is structurally better

`create-0g-dapp` (Schema Labs) shipped a "skills" system: scaffold-time code dumps for
hackathon-track features (prediction-market, social-fi, sealed-inference, …). It is a
genuinely sharp GTM hook. But it has three structural ceilings, each of which is a 0gkit
strength:

| create-0g-dapp "skills" | 0gkit Kits |
| --- | --- |
| Code dump — once generated, nothing to upgrade | Heavy logic lives in **versioned `0gkit-*` packages**; the kit overlay is thin glue → `0g update` story is real |
| Next.js-only (single base) | **Layered / multi-framework** — one kit works across React, Hono, MCP, Node bases |
| Wraps the **official 0G SDKs** (inherits their rough edges, untyped failures) | Built on 0gkit's **typed clients + 45-code error taxonomy + observability** |
| No durability, attestation is cosmetic | **`durable-agent` on 0gkit-jobs** and **real attestation verification surfaced in UI** — categories they can't reach |
| No public repo, no per-combo testing | Every `(kit × base)` combo is **typecheck+build gated in CI** (`pnpm kits:check`) |

This spec is a **clean-room design**, not a port. We take *reference* from their catalog but
define our own capability-led taxonomy, our own (honest, neutrality-clean) kit set, and a
3-tier overlay model they don't have.

**Honesty caveat (load-bearing):** the "hackathon track" names in their README (Agentic
Economy, Verifiable Finance, Web 4.0, Privacy, Agentic Infra) are **not adopted here** — they
are unverified marketing taxonomy. 0gkit Kits are organized by **0G capability domain**
instead. If we later want track-aligned GTM copy, verify the track list against an official
0G hackathon source first.

---

## 2. Architecture

### 2.1 Mechanism — git-overlay + a shared engine (chosen)

Reuse the **exact** pattern `fetchCi()` already uses ([`packages/create-0g-app/src/templates.ts`](../../../packages/create-0g-app/src/templates.ts)):
`giget` downloads a *partial* directory and overlays it onto the generated project. A kit is
`templates/_kits/<kit>/`, overlaid after the base template.

Rejected alternatives: (B) one published npm package per kit + codemods — 8+ packages and
fragile AST rewrites, overkill; (C) string-template codegen like create-0g-dapp — reinvents
giget, logic trapped in TS strings, worse to review/test.

### 2.2 The engine — `@foundryprotocol/0gkit-kits` (new package)

Pure, framework-agnostic. Depends only on `giget` + `zod` (+ a tiny JSON-merge util).
**Must not import any other `0gkit-*` or `@foundryprotocol/*` package** (neutrality + keeps
the CLI cold-start budget, D39). Public surface:

- `listKits({ base? }): KitMeta[]` — registry, filtered to kits compatible with `base`.
- `applyKit({ kit, dest, base, pm, dryRun? }): Promise<ApplyResult>` — fetch overlay, write
  files for the resolved tiers (see §2.3), **merge** `dependencies`/`devDependencies` into
  `package.json`, **append** declared env vars to `.env.example` (idempotent), detect file
  conflicts, return a structured result including post-apply notes + next steps and the
  `[0gkit:kit-applied]` contract token (mirrors the SP16 first-success banner, D71).
- `KitManifestSchema` — the zod schema for `kit.json`.
- Pure helpers: `resolveTiers(manifest, base)`, `mergePackageJson()`, `appendEnv()`.

The engine is consumed by **both** wiring points (§2.4), so the apply logic lives in exactly
one place.

### 2.3 Kit anatomy — the 3-tier layered model

The honest decomposition (lib is portable, **API glue is per-framework**, UI is React-only):

```
templates/_kits/<kit>/
  kit.json                 # manifest (zod-validated)
  lib/                     # TIER 1 — portable core. The actual value. Imports 0gkit-*.
  adapters/<base>/         # TIER 2 — thin per-framework glue (Next route | Hono route | MCP tool)
  ui/                      # TIER 3 — React fragments (components/pages); React bases only
```

`kit.json`:

```jsonc
{
  "name": "prediction-market",
  "title": "Prediction Market",
  "domain": "markets",                  // capability domain (§3), NOT a hackathon track
  "summary": "AI-resolved markets with proofs anchored on 0G.",
  "compatibleBases": ["react-app", "chat", "tee-attested-api", "mcp-agent"],
  "tiers": {
    "lib": ["lib/market.ts", "lib/oracle.ts"],
    "adapters": {
      "react-app": ["app/api/markets/route.ts"],
      "tee-attested-api": ["src/routes/markets.ts"],
      "mcp-agent": ["src/tools/market.ts"]
    },
    "ui": ["app/markets/page.tsx", "components/MarketBoard.tsx"]
  },
  "env": [
    { "key": "OG_COMPUTE_MODEL", "example": "llama-3.1-8b", "note": "oracle model" }
  ],
  "dependencies": {},                   // extra deps beyond what the base already has
  "requires": ["0gkit-compute", "0gkit-chain", "0gkit-storage"], // 0gkit pkgs the base must have
  "composes": ["ai-oracle"],            // kits this kit reuses (auto-applied if missing)
  "conflicts": []
}
```

`resolveTiers(manifest, base)` = `lib` (always) + `adapters[base]` (if present) + `ui` (iff
base is React-capable). A kit is **offered** for a base only when an adapter exists for it
*or* the kit is lib-only. This single manifest expresses both the layered split and
declared-compatibility (the superset decided in brainstorming).

**Composition is a first-class property** (their skills can't do this): `prediction-market`
declares `composes: ["ai-oracle"]`; applying it pulls `ai-oracle` first if absent. Kits build
on kits.

### 2.4 Wiring points

- **Scaffold time** (`create-0g-app`): after base-template fetch, present a multiselect of
  kits compatible with the chosen template (domain-labelled), then `applyKit` each. New
  non-interactive `--kits a,b,c` flag, validated early like `--template`.
- **Existing project** (`0gkit-cli`, the `0g` command): new `0g add <kit...>`,
  `0g kits list [--base ...]`, `0g kits info <kit>`. Engine is **lazy-loaded** (computed
  dynamic import, per D39, to protect cold-start). Base auto-detected from project markers
  (framework dep + presence of `0g.config.ts`).

---

## 3. The kit catalog (our own — 8 kits, by capability domain)

Each kit showcases a specific 0gkit primitive and they **compose**. This batch doubles as a
guided tour of the toolkit's differentiators.

### Domain: Verifiable AI (Compute + Attestation)
1. **`sealed-inference`** — TEE-attested private inference. *lib*: attested compute call +
   report verification; *adapters*: React route+hook (with a "verify attestation" badge),
   Hono attestation-header endpoint, MCP tool; *ui*: chat surfacing the verified attestation.
   Leans on `0gkit-compute` + `0gkit-attestation`. **Better-than:** attestation is actually
   *verified and shown*, and it runs on Hono/MCP, not just React.
2. **`ai-oracle`** — attested off-chain answer → on-chain commitment. *lib*: ask compute,
   anchor `(answerHash, attestation)` on chain. Foundational; `prediction-market` composes it.
   Leans on `0gkit-compute` + `0gkit-chain` + `0gkit-attestation`.

### Domain: Agent Infrastructure (Storage + Jobs + Observability)
3. **`agent-memory`** — persistent, namespaced agent memory on 0G Storage (append + recall +
   keyword index). **Lib-only core → works on ALL 9 bases**; adapters add an MCP `memory.*`
   tool and a React `useAgentMemory` hook. Leans on `0gkit-storage`. *Engine reference kit
   for K0 — cleanest proof of tier portability.*
4. **`durable-agent`** — long-running, resumable agent loop on **`0gkit-jobs`** (survives
   restarts, retries, step ledger), traced via `0gkit-observability`. *adapters*: enqueue/
   inspect API, MCP control tool. **Category create-0g-dapp has no answer to** — durability is
   the moat.

### Domain: Markets & Onchain Data (Chain + Storage + Indexer)
5. **`prediction-market`** — flagship full-stack. *lib*: market lifecycle + AI resolution
   (composes `ai-oracle`) + proof anchoring; full adapters; *ui*: market board / create /
   resolve. Leans on compute + chain + storage + indexer.
6. **`live-feed`** — reorg-safe live event/social feed via **`0gkit-indexer`** (posts/events
   on Storage, indexed live). *lib* + React UI. Supersedes their `social-fi`, done correctly
   (reorg-safe).

### Domain: Assets (Contracts + Storage)
7. **`inft-studio`** — Intelligent-NFT mint + gallery: metadata + media on 0G Storage, typed
   contract via **`0gkit-contracts`** codegen, optional **attested generation provenance**.
   *lib* + React UI. Better-than their `nft-marketplace`: typed contracts + provenance.

### Domain: DeFi — honest / testnet (Compute + Storage)
8. **`yield-intel`** — AI yield **analysis & attested decision log, no auto-execution**.
   Compute analyzes; decisions + rationale are logged to Storage and optionally attested; the
   **user executes manually**. Testnet-default, prominently demo-labelled. This deliberately
   **collapses their `defi-yield-optimizer` + `agent-trading-bot` into one honest kit** — we
   do **not** ship a bot that moves real funds (honesty + safety rule).

*Candidate foundational micro-kit (optional):* `proof-anchor` — anchor any file/data hash +
verifier, lib-only, all bases; a building block several kits could reuse. Deferred unless K1
shows duplication.

---

## 4. Cross-cutting requirements

### 4.1 Testing / CI — the part that beats a code dump
- **Engine unit tests:** registry load, compat filtering, tier resolution, dep merge, env
  append, **idempotent re-apply**, conflict detection, composition resolution.
- **`pnpm kits:check`** (new, modeled on `scripts/check-templates.mjs`): for every
  `(kit × compatible base)`, scaffold base → apply kit → **typecheck + build** the result.
  Guarantees no broken overlay ever ships. Wired into `fresh-machine-smoke` CI.
- **`boundary:check`** extended: `0gkit-kits` and every `templates/_kits/**` overlay must not
  import `@foundryprotocol/*` app packages (neutrality), and the engine must not import other
  `0gkit-*` packages.
- **Manifest schema test:** every `kit.json` validates against `KitManifestSchema`; every
  file referenced in `tiers` exists; every `compatibleBases` entry has an adapter or is
  lib-only.

### 4.2 Docs / GTM
- `apps/docs` new **`/kits`** index + per-kit pages (what it adds, bases, env, usage, the
  0gkit packages it leans on).
- `docs/kits/AUTHORING.md` — how to contribute a kit. The engine being general makes
  **community kits** a real surface (and a community-GTM angle).
- README + landing **"Kits"** section, leading with *upgradeable + typed + multi-framework*,
  with the honest comparison table from §1.

### 4.3 Neutrality & honesty (hard invariants)
- Engine + all kits stay **`@foundryprotocol/*`-app-free** (CI-enforced).
- No Foundry-specific branding/contracts in kits (no ProofClaw, etc.) — kits are generic 0G
  ecosystem use-cases.
- `yield-intel` and any finance-adjacent kit: **testnet defaults, demo banners, zero
  real-money auto-execution.**
- Anything stubbed/unverified in a kit is labelled as such in its docs.

---

## 5. Delivery — the full epic (5 sprints)

One design (this doc) → all sprint plans produced up front via multi-sprint planning. Each
sprint = one squash-merged PR following 0gkit's workflow.

| Sprint | Theme | Scope |
| --- | --- | --- |
| **K0** (SP17) | **Engine + foundational kit** | `0gkit-kits` package (registry, `KitManifestSchema`, `applyKit`, `listKits`, tier resolver, json-merge/env-append); `templates/_kits/` convention; scaffold-time multiselect + `--kits` flag in `create-0g-app`; `0g add` / `0g kits list|info` in `0gkit-cli`; `pnpm kits:check` harness; `boundary:check` extension; **`agent-memory` end-to-end** (lib-only → proves tier portability across React/MCP/Node). Changeset: new pkg + create-0g-app minor + cli minor. |
| **K1** (SP18) | **Verifiable AI + flagship market** | `ai-oracle`, `sealed-inference`, `prediction-market` (composes `ai-oracle`). Exercises composition + all three tiers + attestation surfacing. |
| **K2** (SP19) | **Durability + live data** | `durable-agent` (0gkit-jobs + observability), `live-feed` (0gkit-indexer, reorg-safe). |
| **K3** (SP20) | **Assets + honest DeFi** | `inft-studio` (0gkit-contracts codegen + storage provenance), `yield-intel` (honest, testnet, no bot). |
| **K4** (SP21) | **Docs / GTM / authoring / publish** | `/kits` docs section, landing "Kits" page + comparison, `AUTHORING.md`, `kits:check` in fresh-machine-smoke + lhci, version-packages + publish all changed packages. |

**Roadmap interaction:** this epic re-prioritizes the post-v1 roadmap — the old SP17
(`doctor --fix` + `0g test`) and later items shift to **after K4**. Sequencing is Raj's call
at review.

### Open decisions to confirm at spec review
1. **K0 reference kit** = `agent-memory` (lib-only, lowest-risk engine proof) vs.
   `prediction-market` (flagship demo value, heavier). Spec assumes `agent-memory`.
2. **Catalog size** — ship all 8, or trim `yield-intel` to K-later if finance framing needs
   more thought.
3. **`proof-anchor` micro-kit** — include in K1 or defer.
4. **Roadmap order** — Kits epic before or interleaved with the existing SP17 doctor work.
