---
title: K1 — Verifiable AI kits + flagship prediction-market
date: 2026-06-30
epic: kits
sprint: K1 (proposed SP18)
spec: ../specs/2026-06-30-0gkit-kits-design.md
status: ready
depends_on: K0 (merged — engine + templates/_kits convention live on main)
revised: 2026-06-30 — reconciled against the REAL package APIs (the original
  draft assumed compute.inferAttested / chain.anchor / attestation.verify, none
  of which exist). Decisions folded in: honest signed-receipt attestation (no
  fabricated TEE verification); BOTH anchor mechanisms (0G Storage default +
  opt-in on-chain contract).
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

# K1 — `ai-oracle`, `sealed-inference`, `prediction-market`

## Goal

Ship the **Verifiable AI** domain and the flagship market kit. Prove kit
**composition** (`prediction-market` composes `ai-oracle`) and **real,
honestly-labeled verification surfaced in UI** (`sealed-inference`). After K1, a
hackathon builder runs `0g add prediction-market` and gets an AI-resolved,
proof-anchored market — typed, signed-and-verified, multi-framework.

## ⚠️ Reality check (read before writing any code)

The original draft of this plan was written against an **imagined** API surface.
The REAL exports (verified by reading the package sources) are:

| Plan-draft assumed                                            | Reality — use THIS                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compute.inferAttested({model,prompt}) → {text, attestation}` | `new Compute(cfg).inference({ messages:[{role:"user",content:prompt}] }) → { output, receipt:{ txHash?, latencyMs } }`. **Compute returns no attestation.**                                                                                                                                          |
| `chain.anchor({hash}) → {txHash}`                             | **No anchor primitive exists.** On-chain writes go through `@foundryprotocol/0gkit-contracts` → `createTypedContract({address,abi,signer}).write.<fn>(args) → Receipt`. Mirror the foundry convention in `templates/nft-with-storage` (`foundry.toml` + `contracts/*.sol` + `scripts/Deploy.s.sol`). |
| `attestation.verify(report) → bool`                           | `@foundryprotocol/0gkit-attestation` exposes `signEnvelope`/`signEnvelopeWithSigner`/`verifyEnvelope` over the **eval-result-specific** `foundry/eval-result/v1` envelope. There is **no TEE quote verification anywhere in the stack.**                                                             |
| `0gkit-storage` upload/download                               | ✅ real: `new Storage(cfg).upload(Uint8Array) → {root, tx}`; `.download(root) → Uint8Array`; `.exists(root)`. Content-addressed (immutable roots) — mirror the **agent-memory** kit's in-process root-registry pattern.                                                                              |

**Honesty invariants for this sprint (hard):**

- The verification badge means **"this inference output was signed by the
  expected operator/provider key and the digest matches"** — i.e. a _signed
  receipt_, **NOT** "a TEE quote was cryptographically verified." Never render
  "TEE attested ✓" or imply enclave verification the stack does not perform.
- Architect the attestor behind an injected `Attestor` interface so a real
  TEE-quote verifier can replace the signed-receipt impl later **without
  touching the kit lib**. Document the seam.
- The default anchor is **0G Storage** ("proof anchored to 0G Storage", a real
  immutable content-addressed root). The opt-in anchor is a **real on-chain tx**
  ("committed on-chain"). Label each for exactly what it is.

## Architecture

Three kits. Composition chain `prediction-market → ai-oracle`. `sealed-inference`
is independent. Each kit's `lib` is **portable** and depends only on injected
interfaces (mirrors `agent-memory`); adapters wire the real packages per base.

### Shared honest primitives (each kit's lib defines its own injected interfaces)

```ts
// Injected by adapters/tests — the lib never imports a package directly.
export interface InferenceClient {
  infer(args: { prompt: string; model?: string }): Promise<{ output: string }>;
}

// Signed-receipt attestor. Portable impl signs a canonical digest of the
// receipt; verify recovers the signer. NOT a TEE quote verifier — the seam
// lets a real one drop in later.
export interface Attestor {
  sign(receipt: unknown): Promise<{ digest: string; signature: string }>;
  verify(
    receipt: unknown,
    signed: { digest: string; signature: string },
    expectedSigner: string
  ): Promise<{ ok: boolean; signer: string }>;
}

// Commitment anchor. Default impl = 0G Storage upload (ref = root).
// Opt-in impl = on-chain contract write (ref = txHash).
export interface Anchor {
  anchor(
    payload: Uint8Array | string
  ): Promise<{ ref: string; kind: "storage" | "onchain" }>;
}
```

- Portable `Attestor` impl: build a canonical digest with
  `digestJson` from `@foundryprotocol/0gkit-core`, sign with viem
  (`sign`/`hashMessage`) or a `Signer`; verify with `recoverAddress`. This is
  honest and reuses the exact mechanism `0gkit-attestation` uses internally.
- Default `Anchor` impl (adapter): `Storage.upload(new TextEncoder().encode(json))`
  → `{ ref: result.root, kind: "storage" }`.
- Opt-in on-chain `Anchor` impl (adapter, gated behind an env flag):
  `createTypedContract({ address, abi: ANCHOR_ABI, signer }).write.anchor(hash)`
  → `{ ref: receipt.txHash, kind: "onchain" }`.

## Working dir / Branch

- Working dir: `/Users/rajkaria/Projects/0G-ai-kit`
- Branch: `kits-k1-verifiable-ai` (already created off merged `main`)

## File structure (Created)

```
templates/_kits/ai-oracle/
  kit.json
  lib/oracle.ts                          # infer → hash → sign receipt → anchor
  lib/__tests__/oracle.test.ts
  adapters/react-app/app/api/oracle/route.ts
  adapters/tee-attested-api/src/routes/oracle.ts
  adapters/mcp-agent/src/tools/oracle.ts
  contracts/Anchor.sol                   # opt-in on-chain anchor (foundry)
  contracts/anchor-abi.ts                # `as const` ABI for createTypedContract
  contracts/foundry.toml
  contracts/script/DeployAnchor.s.sol
templates/_kits/sealed-inference/
  kit.json
  lib/sealed.ts                          # infer + sign + verify → {text,attestation,verified}
  lib/__tests__/sealed.test.ts
  adapters/react-app/app/api/sealed/route.ts
  adapters/tee-attested-api/src/routes/sealed.ts
  adapters/mcp-agent/src/tools/sealed.ts
  ui/components/SealedChat.tsx           # "✓ signature verified" / "⚠ unverified"
  ui/hooks/useSealedInference.ts
templates/_kits/prediction-market/
  kit.json                               # composes: ["ai-oracle"]
  lib/market.ts                          # open → bet → resolve(via oracle) → settle
  lib/__tests__/market.test.ts
  adapters/react-app/app/api/markets/route.ts
  adapters/tee-attested-api/src/routes/markets.ts
  ui/app/markets/page.tsx
  ui/components/MarketBoard.tsx
  ui/components/CreateMarketForm.tsx
apps/docs/app/kits/{ai-oracle,sealed-inference,prediction-market}/page.mdx  # stubs
```

**Modified**: `apps/docs/lib/nav.ts` (Kits nav entries for the 3 stub pages);
`.changeset/kits-verifiable-ai.md`. No package version bump unless the registry
codegen embedded list changes the engine output → then an `0gkit-kits` patch
(the changeset notes this conditionally).

## Reference implementation to mirror

`templates/_kits/agent-memory/` — the shipped K0 kit. Its `lib/agent-memory.ts`
(portable, injected `MemoryStorage`), `adapters/*/...` (wire real `Storage` via
an in-process root registry), `ui/*`, and `kit.json` are the canonical shapes.
**Read it first.** Honesty + injected-deps + content-addressed-storage patterns
all transfer directly.

## Task graph

```
T1 ai-oracle (lib + 3 adapters + opt-in Anchor contract)
      │  composes-into
      ▼
T3 prediction-market (lib + 2 adapters + ui)
T2 sealed-inference (lib + 3 adapters + ui)   ← independent, parallel-safe with T1
      └──────────────┬───────────────┘
                     ▼
   T4 kits:check matrix + docs stubs + nav + changeset + full gate + PR
```

---

## Tasks

### T1 — `ai-oracle` kit (TDD)

- [ ] **Read** `templates/_kits/agent-memory/` end-to-end first.
- [ ] **Failing test** — `lib/__tests__/oracle.test.ts`: `resolveOracle(deps, question)`
      calls injected `deps.infer`, sets `answerHash = "0x"+sha256(output)`, calls
      injected `deps.attestor.sign` with the receipt, calls injected `deps.anchor.anchor`,
      and returns `{ answer, answerHash, attestation, commitment }`. Assert
      `answerHash === sha256(answer)` and that `commitment.ref` is the anchor's ref.
      Use a mock `infer`/`attestor`/`anchor` (no real packages in the lib test).
- [ ] **Run** → red.
- [ ] **Implement** `lib/oracle.ts` — portable, injected `{ infer, attestor, anchor }`,
      `node:crypto` `createHash` for the hash. No `@foundryprotocol/*` import in the lib.
- [ ] **Implement** adapters wiring the REAL packages: - `adapters/react-app/app/api/oracle/route.ts` — `Compute.inference`, viem/0gkit-core
      signed-receipt `Attestor`, `Storage`-backed default `Anchor`, opt-in on-chain
      `Anchor` (via `createTypedContract`) gated on `OG_ANCHOR_ONCHAIN === "1"`. - `adapters/tee-attested-api/src/routes/oracle.ts` — same wiring, Hono/route style of the base. - `adapters/mcp-agent/src/tools/oracle.ts` — same wiring, MCP tool shape.
- [ ] **Implement** opt-in on-chain anchor contract: `contracts/Anchor.sol`
      (stores/`emit Anchored(bytes32 hash, string tag, address by)`), `contracts/anchor-abi.ts`
      (`as const`), `contracts/foundry.toml`, `contracts/script/DeployAnchor.s.sol` —
      mirror `templates/nft-with-storage`.
- [ ] `kit.json`: `domain:"verifiable-ai"`, `compatibleBases:["react-app","chat","tee-attested-api","mcp-agent"]`,
      `requires:["0gkit-compute","0gkit-attestation"]`,
      `dependencies:{"@foundryprotocol/0gkit-storage":"^1.0.0","@foundryprotocol/0gkit-contracts":"^1.0.0"}`,
      tiers lib + the three adapters, **no UI**. Env: `OG_COMPUTE_MODEL`, `OG_PRIVATE_KEY`,
      `OG_RPC_URL`, `OG_ANCHOR_ONCHAIN` (note: `1` enables the on-chain anchor),
      `OG_ANCHOR_ADDRESS` (deployed Anchor contract).
- [ ] **Run** → green. **Commit**: `feat(kits): ai-oracle (signed AI answer → 0G-Storage / on-chain anchor)`.

### T2 — `sealed-inference` kit (TDD)

- [ ] **Failing test** — `lib/__tests__/sealed.test.ts`: `sealedInfer(deps, prompt)` returns
      `{ text, attestation, verified }`. `verified` is `true` only when the injected
      `attestor.verify` resolves `{ ok: true }`; a tampered signature → `{ verified: false }`;
      **never throws** (UI shows the badge state).
- [ ] **Run** → red.
- [ ] **Implement** `lib/sealed.ts` — portable, injected `{ infer, attestor }`; infer →
      sign receipt → `verified = (await attestor.verify(...)).ok`; no throw.
- [ ] **Implement** adapters (react-app `app/api/sealed/route.ts`, tee-attested-api
      `src/routes/sealed.ts`, mcp-agent `src/tools/sealed.ts`) wiring real `Compute` +
      signed-receipt `Attestor`.
- [ ] **Implement** UI: `ui/components/SealedChat.tsx` (badge **"✓ signature verified"** /
      **"⚠ unverified"** strictly from the real `verified` value — never hard-coded),
      `ui/hooks/useSealedInference.ts`.
- [ ] `kit.json`: `domain:"verifiable-ai"`, bases `["react-app","chat","tee-attested-api","mcp-agent"]`,
      `requires:["0gkit-compute","0gkit-attestation"]`, lib + 3 adapters + UI. Env:
      `OG_COMPUTE_MODEL`, `OG_PRIVATE_KEY`, `OG_RPC_URL`, `OG_ATTESTOR_ADDRESS`
      (expected signer of the receipt).
- [ ] **Run** → green. **Commit**: `feat(kits): sealed-inference (signed inference + verified badge)`.

### T3 — `prediction-market` kit — composes `ai-oracle` (TDD)

- [ ] **Failing test** — `lib/__tests__/market.test.ts`: `resolveMarket(deps, id)` delegates
      to injected `resolveOracle`, stores the resolution receipt via injected storage, and
      transitions the market to `settled`. Assert the stored receipt contains
      `{ answer, answerHash, commitment }`. Also an apply-composition test (see below).
- [ ] **Run** → red.
- [ ] **Implement** `lib/market.ts` — lifecycle `open` / `bet` / `resolve` / `settle`;
      `resolve` calls injected `resolveOracle`; markets + bets + receipts persisted via an
      injected storage interface; market index via the **storage-root registry** pattern
      from agent-memory (NOT the event Indexer — it is subscription-based and needs a
      contract emitting events; out of scope here).
- [ ] **Implement** adapters: `adapters/react-app/app/api/markets/route.ts`,
      `adapters/tee-attested-api/src/routes/markets.ts` — wire real `Storage` + the
      `ai-oracle` resolver.
- [ ] **Implement** UI: `ui/app/markets/page.tsx`, `ui/components/MarketBoard.tsx`,
      `ui/components/CreateMarketForm.tsx`.
- [ ] `kit.json`: `domain:"markets"`, `composes:["ai-oracle"]`,
      `compatibleBases:["react-app","chat","tee-attested-api"]`,
      `requires:["0gkit-compute","0gkit-attestation","0gkit-storage"]`,
      `dependencies:{"@foundryprotocol/0gkit-storage":"^1.0.0"}`, lib + 2 adapters + UI.
- [ ] **Run** → green. **Verify composition** — a test asserting
      `applyKit({kit:"prediction-market", base:"react-app", dest:tmp})` (with a mock
      `fetchOverlay` that copies the local overlays) ALSO writes `ai-oracle`'s `lib/oracle.ts`.
- [ ] **Commit**: `feat(kits): prediction-market flagship (composes ai-oracle)`.

### T4 — matrix check + docs stubs + changeset + gate + PR

- [ ] **Run** `pnpm kits:check` — every new `(kit × base)` scaffolds, applies, type-checks,
      builds (incl. React/Next bases). Fix any base whose adapter doesn't compile. The
      on-chain anchor path must type-check against the real `createTypedContract` signature.
- [ ] **Implement** docs stubs `apps/docs/app/kits/{ai-oracle,sealed-inference,prediction-market}/page.mdx`
      (full polish lands in K4) and register them in `apps/docs/lib/nav.ts` so the docs
      build + nav stay consistent. (Lesson from the K0 ship: a new docs page must be
      nav-registered and prettier-clean, and the docs build must pass.)
- [ ] **Implement** `.changeset/kits-verifiable-ai.md` — `0gkit-kits` patch IFF the registry
      codegen output changed (it will: 3 new kits enter `KITS`); otherwise repo-only note.
      Re-run `pnpm --filter @foundryprotocol/0gkit-kits build` and confirm
      `registry.generated.ts` is prettier-clean (the generator now formats it).
- [ ] **Run** the FULL gate — `format:check · build · lint · boundary:check · typecheck ·
    test · test:scripts · docs:check · templates:check · kits:check` — all green. (This
      is the same gate the K0 ship learned to run completely; do not skip docs:check.)
- [ ] **Commit** + push + open PR `K1 — Verifiable AI + prediction-market`.
- [ ] **Whole-branch review** (most-capable model) BEFORE merge — per the project rule,
      green per-task gates miss integration-seam bugs. Then squash-merge on green CI.

## Self-review checklist

- [ ] No kit `lib` imports a package directly (portable; injected deps only).
- [ ] `prediction-market` composition pulls `ai-oracle` (verified by an apply test).
- [ ] `sealed-inference` badge reflects the REAL `verify()` result, never hard-coded,
      and the lib never throws on a bad signature.
- [ ] **Honesty**: nothing claims TEE-quote verification; the badge says "signature
      verified". Storage anchor labeled "0G Storage", on-chain anchor labeled "on-chain".
- [ ] No kit imports `@foundryprotocol/*` **app** packages (boundary:check green).
- [ ] On-chain anchor type-checks against real `createTypedContract().write.*`.
- [ ] All kits type-check + build on every declared base via `kits:check`.
- [ ] Adapters wire ONLY real, verified exports (no invented `inferAttested`/`anchor`/`verify`).
- [ ] `registry.generated.ts` regenerated + prettier-clean; docs:check green; new docs
      pages nav-registered.
- [ ] No engine (`0gkit-kits`) source changes leaked in — if a kit needs an engine
      capability that's missing, STOP and amend K0 separately.
