---
title: K1 — Verifiable AI kits + flagship prediction-market
date: 2026-06-30
epic: kits
sprint: K1 (proposed SP18)
spec: ../specs/2026-06-30-0gkit-kits-design.md
status: ready
depends_on: K0 (engine + templates/_kits convention must be merged)
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

# K1 — `ai-oracle`, `sealed-inference`, `prediction-market`

## Goal

Ship the **Verifiable AI** domain and the flagship market kit. Prove kit
**composition** (`prediction-market` composes `ai-oracle`) and **real
attestation surfaced in UI** (`sealed-inference`). After K1, a hackathon
builder runs `0g add prediction-market` and gets an AI-resolved, proof-anchored
market — typed, attested, multi-framework.

## Dependencies (already shipped)

- **K0** — `@foundryprotocol/0gkit-kits` engine, `templates/_kits/` convention,
  `kit.json` schema, `applyKit`/`resolveTiers`/composition, `kits:check` matrix,
  `0g add` + scaffold `--kits`. This sprint only *adds kit overlays*; the engine
  is unchanged.
- 0gkit packages consumed by these kits (all published ≥1.5.0):
  `0gkit-compute` (inference), `0gkit-attestation` (TEE verify), `0gkit-chain`
  (anchor tx), `0gkit-storage` (proof blobs), `0gkit-indexer` (live market list).

## Architecture

Three kits, composition chain `prediction-market → ai-oracle → (compute +
attestation + chain)`. `sealed-inference` is independent (compute + attestation).
No engine changes — if any kit needs an engine capability that doesn't exist,
**stop and amend K0**, do not special-case it here.

## Working dir / Branch

- Working dir: `/Users/rajkaria/Projects/0G-ai-kit`
- Branch: `kits-k1-verifiable-ai` (off `main` after K0 merges)

## File structure (Created)

```
templates/_kits/ai-oracle/
  kit.json
  lib/oracle.ts                         # ask compute → anchor (answerHash, attestation) on chain
  adapters/react-app/app/api/oracle/route.ts
  adapters/tee-attested-api/src/routes/oracle.ts
  adapters/mcp-agent/src/tools/oracle.ts
  lib/__tests__/oracle.test.ts
templates/_kits/sealed-inference/
  kit.json
  lib/sealed.ts                         # attested compute call + report verify
  adapters/react-app/app/api/sealed/route.ts
  adapters/tee-attested-api/src/routes/sealed.ts
  adapters/mcp-agent/src/tools/sealed.ts
  ui/components/SealedChat.tsx          # chat with "✓ attestation verified" badge
  ui/hooks/useSealedInference.ts
  lib/__tests__/sealed.test.ts
templates/_kits/prediction-market/
  kit.json                              # composes: ["ai-oracle"]
  lib/market.ts                         # lifecycle: open → bet → resolve(via oracle) → settle
  adapters/react-app/app/api/markets/route.ts
  adapters/tee-attested-api/src/routes/markets.ts
  ui/app/markets/page.tsx
  ui/components/MarketBoard.tsx
  ui/components/CreateMarketForm.tsx
  lib/__tests__/market.test.ts
```

**Modified**: `.changeset/kits-verifiable-ai.md` (no package version bump —
overlays ship with the repo; bump only if `kit.json` registry codegen changes
the engine's embedded list → engine patch).

## Task graph

```
T1 ai-oracle (lib+adapters)
      │  composes-into
      ▼
T3 prediction-market (lib+adapters+ui)
T2 sealed-inference (lib+adapters+ui)   ← independent, parallel-safe with T1
      └──────────────┬───────────────┘
                     ▼
            T4 kits:check + docs stubs + changeset
```

---

## Tasks

### T1 — `ai-oracle` kit

- [ ] **Failing test** — `lib/__tests__/oracle.test.ts`: `resolve(question)` calls
  injected `compute.infer`, hashes the answer, calls injected `chain.anchor` with
  `(answerHash, attestationId)`, and returns `{ answer, answerHash, txHash, attestation }`.
  Assert the anchored hash equals `sha256(answer)`.
- [ ] **Run** → red.
- [ ] **Implement** — `lib/oracle.ts`:
```ts
import { createHash } from "node:crypto";
export interface OracleDeps { compute: Compute; chain: Chain; }
export async function resolveOracle(deps: OracleDeps, question: string, model = process.env.OG_COMPUTE_MODEL) {
  const { text, attestation } = await deps.compute.inferAttested({ model, prompt: question });
  const answerHash = "0x" + createHash("sha256").update(text).digest("hex");
  const { txHash } = await deps.chain.anchor({ hash: answerHash, tag: "ai-oracle" });
  return { answer: text, answerHash, txHash, attestation };
}
```
  `kit.json`: `domain:"verifiable-ai"`, `compatibleBases:["react-app","chat","tee-attested-api","mcp-agent"]`, `requires:["0gkit-compute","0gkit-chain","0gkit-attestation"]`, lib + three adapters, no UI.
- [ ] **Run** → green. **Commit**: `feat(kits): ai-oracle (attested answer → on-chain commit)`.

### T2 — `sealed-inference` kit

- [ ] **Failing test** — `lib/__tests__/sealed.test.ts`: `sealedInfer(prompt)` returns
  `{ text, attestation, verified }`; `verified` is `true` only when the injected
  `attestation.verify` resolves truthy; a tampered report → `verified:false` (never throws —
  the UI shows the badge state).
- [ ] **Run** → red.
- [ ] **Implement** — `lib/sealed.ts` (compute.inferAttested + attestation.verify, returns
  verification state, no throw). `kit.json`: `domain:"verifiable-ai"`,
  `compatibleBases:["react-app","chat","tee-attested-api","mcp-agent"]`,
  `requires:["0gkit-compute","0gkit-attestation"]`, lib + 3 adapters + UI
  (`SealedChat` shows `✓ attestation verified` / `⚠ unverified`).
- [ ] **Run** → green. **Commit**: `feat(kits): sealed-inference (TEE-attested private inference + verified badge)`.

### T3 — `prediction-market` kit (composes ai-oracle)

- [ ] **Failing test** — `lib/__tests__/market.test.ts`: `resolveMarket(id)` delegates to
  `resolveOracle` (injected), stores the resolution receipt on storage, and transitions the
  market to `settled`. Assert the receipt blob contains `{ answer, answerHash, txHash }`.
- [ ] **Run** → red.
- [ ] **Implement** — `lib/market.ts`: market lifecycle (`open`/`bet`/`resolve`/`settle`),
  `resolve` calls `resolveOracle`, receipts to 0G Storage, market index via 0gkit-indexer.
  `kit.json`: `domain:"markets"`, `composes:["ai-oracle"]`,
  `compatibleBases:["react-app","chat","tee-attested-api"]`,
  `requires:["0gkit-compute","0gkit-chain","0gkit-storage","0gkit-indexer"]`,
  lib + 2 adapters + UI (board/create/resolve).
- [ ] **Run** → green. **Verify composition** — `applyKit({kit:"prediction-market", base:"react-app", dest:tmp})` also writes `ai-oracle`'s lib (assert in an apply test).
- [ ] **Commit**: `feat(kits): prediction-market flagship (composes ai-oracle)`.

### T4 — matrix check + docs stubs + changeset

- [ ] **Run** — `pnpm kits:check` → every new `(kit × base)` combo scaffolds, applies,
  typechecks, builds. Fix any base whose adapter doesn't compile.
- [ ] **Implement** — docs stub pages under `apps/docs/app/kits/{ai-oracle,sealed-inference,prediction-market}/page.mdx` (full polish lands in K4; stubs keep `docs:check` green and the nav populated).
- [ ] **Implement** — `.changeset/kits-verifiable-ai.md` (engine patch iff registry codegen changed; otherwise a `repo`-only note).
- [ ] **Run** — full gate (`lint typecheck build test boundary:check templates:check kits:check docs:check format:check`) → green.
- [ ] **Commit** + PR `K1 — Verifiable AI + prediction-market`. Squash-merge on green.

## Self-review checklist

- [ ] `prediction-market` composition pulls `ai-oracle` (verified by an apply test).
- [ ] `sealed-inference` surfaces a real verification state and never throws on a bad report.
- [ ] No kit imports `@foundryprotocol/*` app packages (boundary:check green).
- [ ] All three kits typecheck+build on every declared base via `kits:check`.
- [ ] Honesty: attestation badge reflects actual `verify()` result, not a hard-coded "✓".
- [ ] No engine changes leaked into this sprint (K0 is frozen; amend K0 if a gap appears).
