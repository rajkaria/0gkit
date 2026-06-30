---
title: K3 — inft-studio + yield-intel kits
date: 2026-06-30
epic: kits
sprint: K3 (proposed SP20)
spec: ../specs/2026-06-30-0gkit-kits-design.md
status: ready
depends_on: K0 (engine); K1 (ai-oracle pattern reused by yield-intel decision log)
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

# K3 — `inft-studio`, `yield-intel` (honest DeFi)

## Goal

Ship the **Assets** domain (`inft-studio` — Intelligent-NFT mint + gallery with
typed contracts and attested provenance) and the **honest DeFi** kit
(`yield-intel` — AI analysis + attested decision log, **no money-moving bot**).
This is where the honesty rule is load-bearing: we deliberately do NOT ship an
auto-trader.

## Dependencies (already shipped)

- **K0** engine; `0gkit-contracts` (typed client codegen, `standardContracts.erc721`),
  `0gkit-storage`, `0gkit-compute`, `0gkit-attestation`, `0gkit-chain`.

## Architecture

- `inft-studio`: typed ERC-721 client via `0gkit-contracts` codegen; metadata +
  media to 0G Storage; optional **attested generation provenance** (the model +
  prompt that produced the asset, attested and stored alongside).
- `yield-intel`: compute analyzes yields (read-only data in), writes a
  **decision + rationale** record to Storage, optionally attested; the user
  executes manually. **Testnet-default. Prominent demo banner. No signing of
  value-moving txs by default.**

## Working dir / Branch

- Working dir: `/Users/rajkaria/Projects/0G-ai-kit`
- Branch: `kits-k3-assets-defi` (off `main` after K2 merges)

## File structure (Created)

```
templates/_kits/inft-studio/
  kit.json
  lib/inft.ts                           # mint(metadata, media) → storage + typed erc721
  lib/provenance.ts                     # attested {model, prompt, contentHash}
  adapters/react-app/app/api/inft/route.ts
  ui/app/studio/page.tsx
  ui/components/{MintForm,Gallery,ProvenanceBadge}.tsx
  lib/__tests__/inft.test.ts
templates/_kits/yield-intel/
  kit.json
  lib/yield.ts                          # analyze(positions) → ranked + rationale (read-only)
  lib/decisionLog.ts                    # write attested decision record to storage
  adapters/react-app/app/api/yield/route.ts
  adapters/tee-attested-api/src/routes/yield.ts
  ui/app/yield/page.tsx
  ui/components/{YieldTable,DecisionLog,DemoBanner}.tsx   # DemoBanner is non-removable in template
  lib/__tests__/yield.test.ts
```

**Modified**: `.changeset/kits-assets-defi.md`.

## Task graph

```
T1 inft-studio (lib + adapter + ui)
T2 yield-intel (lib + adapters + ui, honest framing)   ← parallel-safe with T1
        └───────────────┬───────────────┘
                        ▼
              T3 kits:check + honesty audit + docs stubs + changeset
```

---

## Tasks

### T1 — `inft-studio` kit

- [ ] **Failing test** — `lib/__tests__/inft.test.ts`: `mint({ metadata, media })` uploads
      media + metadata to injected storage, mints via injected typed erc721 client, and returns
      `{ tokenId, tokenUri, contentHash, provenance? }`. With `attestProvenance:true`, the
      provenance record carries a verified attestation.
- [ ] **Run** → red.
- [ ] **Implement** — `lib/inft.ts` + `lib/provenance.ts`. `kit.json`: `domain:"assets"`,
      `compatibleBases:["react-app","chat"]`, `requires:["0gkit-contracts","0gkit-storage","0gkit-attestation"]`,
      lib + react adapter + UI (`ProvenanceBadge` shows attested model/prompt).
- [ ] **Run** → green. **Commit**: `feat(kits): inft-studio (typed INFT mint + attested provenance)`.

### T2 — `yield-intel` kit (honest, no bot)

- [ ] **Failing test** — `lib/__tests__/yield.test.ts`: `analyze(positions)` returns a ranked
      list + per-item rationale from injected compute; `logDecision(d)` writes an attested record
      to injected storage. **Negative test:** the kit exposes **no** function that signs or sends
      a value-moving transaction (assert the public API surface contains no `execute`/`trade`/`swap`).
- [ ] **Run** → red.
- [ ] **Implement** — `lib/yield.ts` (read-only analysis) + `lib/decisionLog.ts` (attested log).
      `kit.json`: `domain:"defi"`, `compatibleBases:["react-app","chat","tee-attested-api"]`,
      `requires:["0gkit-compute","0gkit-storage","0gkit-attestation"]`,
      env defaults to **testnet** (`OG_NETWORK=galileo`), lib + 2 adapters + UI. `DemoBanner`
      renders an unremovable "Demo — not financial advice; no automated execution" notice; the
      generated `.env.example` documents that mainnet + execution are intentionally out of scope.
- [ ] **Run** → green. **Commit**: `feat(kits): yield-intel (AI analysis + attested decision log, no auto-execution)`.

### T3 — matrix check + honesty audit + docs + changeset

- [ ] **Honesty audit** — grep the two kits for any signing of value-moving txs, any mainnet
      default, any "guaranteed"/"profit" copy. `yield-intel` must be testnet-default and
      execution-free. Record the finding in the PR description.
- [ ] **Run** — `pnpm kits:check` → green.
- [ ] **Implement** — `apps/docs/app/kits/{inft-studio,yield-intel}/page.mdx` stubs;
      `yield-intel` page leads with the demo/safety disclaimer.
- [ ] **Implement** — `.changeset/kits-assets-defi.md`.
- [ ] **Run** — full gate → green. **Commit** + PR `K3 — assets + honest DeFi`. Squash-merge on green.

## Self-review checklist

- [ ] `yield-intel` public API contains NO execute/trade/swap/sign-value function (test-asserted).
- [ ] `yield-intel` defaults to testnet; `DemoBanner` present and non-removable in the template.
- [ ] `inft-studio` provenance badge reflects a real attestation, not a placeholder.
- [ ] Typed erc721 client comes from `0gkit-contracts` codegen, not a hand-rolled ABI.
- [ ] No `@foundryprotocol/*` app imports (boundary:check green).
- [ ] All combos typecheck+build via `kits:check`.
