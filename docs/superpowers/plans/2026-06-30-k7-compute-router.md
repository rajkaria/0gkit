---
title: K7 — First-class Compute Router (`Compute.router()`)
date: 2026-06-30
epic: kits
sprint: K7 (old SP19)
spec: ../specs/2026-06-30-0gkit-kits-design.md
roadmap: 2026-06-30-kits-epic-roadmap.md
status: ready
depends_on: [K0]
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

## Reality check (2026-07-01) — read this first; it supersedes the fictional bits below

This plan was written 2026-06-30 against assumed APIs. A pre-build reality-check
(the K1/K5/K6 lesson) + the T0 research gate found **five drifts**. The
corrections below govern; where the older task text conflicts, the correction wins.
Research findings: [`docs/research/2026-07-01-0g-router-api.md`](../../research/2026-07-01-0g-router-api.md).

| #   | Plan assumed                                                | Reality                                                                                                                                                                                                            | Correction                                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `router()` = client-side list-and-select (no server Router) | **The 0G Router is a real server endpoint** — `router-api.0g.ai/v1`, OpenAI-compatible HTTP, `Bearer <ROUTER_API_KEY>`, server-side selection + failover (testnet: `router-api-testnet.integratenetwork.work/v1`). | **Wire the real endpoint** (honesty rule). Its auth (API key from pc.0g.ai Web UI) differs from our wallet-signer path, so add `routerApiKey`/`routerUrl` to `ComputeConfig`. Keep client-side select as an **honest fallback** when no key is set. |
| 2   | `inference({ provider, … })` takes a per-call provider      | It does **not** — `inference()` reads `this.cfg.provider` via `requireProvider()`.                                                                                                                                 | Additively accept an optional `provider?` on `inference()` (D13-safe); `requireProvider(override?)` prefers it. Unblocks the fallback's per-candidate calls + `direct({ provider })`.                                                               |
| 3   | Templates `chat`, `inference-app`, `ai-agent` call compute  | `templates/chat` has **no compute**. Real compute callers: `inference-app`, `ai-agent`, `tee-attested-api`.                                                                                                        | Migrate those three. `inference-app` is the flagship — it already hand-rolls `listProviders()`+pick, which `router()` replaces.                                                                                                                     |
| 4   | Decisions D86–D88                                           | D86–D88 already exist (K5 = D86, K6 = D87–D88).                                                                                                                                                                    | Renumber to **D89–D91**.                                                                                                                                                                                                                            |
| 5   | Kit "synergy" is vague/aspirational                         | Kit adapters build `new Compute({ signer })` with **no `provider`** → `inference()` throws today. `router()` genuinely fixes this. Real synergy lives in the adapter `infer` wrappers, not the kit `lib/*.ts`.     | Flip the compute-calling kit adapters (`ai-oracle`, `sealed-inference`, `yield-intel`, `prediction-market`) to `router()`. This both delivers the synergy **and** fixes a latent no-provider bug.                                                   |

**Corrected public surface** (identical whether real endpoint or fallback resolves it):

```ts
compute.router({
  model?: string,          // optional; when omitted the fallback tries all providers
  messages: ChatMessage[],
  temperature?: number,
  prefer?: string,         // pin a provider — steers the client-side fallback only (the managed endpoint does its own selection; no verified pin field)
  sort?: "price",          // real-endpoint routing knob (documented); ignored by the fallback
  maxAttempts?: number,    // fallback retry cap
}): Promise<InferenceResult>
```

Task-by-task deltas: **T0** → done (research doc written, endpoint VERIFIED).
**T1** `selectProviders()` stands, plus a shared defensive `pickProviderAddress`/
`toProviderInfo` mapper (real `listService()` entries are loose `unknown`).
**T2** `router()` = real-endpoint-first, client-fallback-second (not the single
strategy shown below). **T3** `direct()` alias + the per-call `provider` on
`inference()` (drift #2). **T4** templates = `inference-app`/`ai-agent`/
`tee-attested-api` (not `chat`). **T4b (new)** kit-adapter flip (drift #5).
**T5** docs carry the real-endpoint-vs-fallback honesty note. **T6** changeset +
**D89–D91**.

# K7 — First-class Compute Router

## Goal

Add a model-first compute API that picks a provider for you, retries, and falls
back — so app code stops hard-coding a provider address. After K7:

```ts
import { Compute } from "@foundryprotocol/0gkit-compute";

const compute = new Compute({ network: "galileo", brokerKey });
const r = await compute.router({
  model: "llama-3.1-8b",
  messages: [{ role: "user", content: "hi" }],
});
// provider chosen behind the scenes, with retries + fallback
```

`Compute.inference({ provider, ... })` is preserved and additionally surfaced as
`Compute.direct()` (a back-compat alias — no removal, D13 = no renames of the
public type). Templates default to `router()`. **K0 synergy:** every kit that
calls compute (`sealed-inference`, `ai-oracle`, `prediction-market`,
`durable-agent`) defaults to `router()`.

## Dependencies / Architecture

> **RESEARCH GATE (block 1 day, T0):** 0G's "Router" is the abstraction layer
> above per-provider selection. **Confirm the public Router API surface with the
> 0G compute / serving docs before writing the adapter.** Until verified, the
> router selects among providers returned by the _already-shipped_
> `Compute.listProviders()` (which calls `broker.inference.listService()`,
> [packages/0gkit-compute/src/compute.ts](../../../packages/0gkit-compute/src/compute.ts)) —
> a real, honest fallback that needs no unverified endpoint. **Honesty rule:** if
> a dedicated Router endpoint is confirmed, wire it; if not, ship the
> list-and-select strategy and label it as such in docs. Do NOT fabricate a
> Router endpoint.

- **`Compute` already exists** with `inference()`, `listProviders()`, and an
  internal broker ([packages/0gkit-compute/src/compute.ts](../../../packages/0gkit-compute/src/compute.ts)).
  K7 adds `router(args)` as a new method on the same class — it resolves a
  provider, then delegates to the existing `inference()` path. No rewrite of the
  broker plumbing.
- **Selection strategy** lives in a pure, injectable module (`router-select.ts`):
  `(providers, { model, prefer? }) → ordered candidate list`. Retries + fallback
  walk that list. Deterministic + unit-testable with no network.
- **Back-compat alias:** `direct(args)` is an alias that calls `inference(args)`
  unchanged. The existing `inference()` signature stays (no behaviour change for
  v1.x callers). This honours D13 (no renames of the published `Compute` type).
- **No Aristotle gating (D10):** router works on galileo + local; the selection
  strategy degrades to "the one configured provider" when only one is reachable.
- **K0 synergy:** kits in `templates/_kits/*/lib/*.ts` that call compute import
  `Compute` and call `router()`; this sprint flips the templates' default and
  documents `router()` as the kit-author default in the K4 authoring guide.

## Tech Stack

TypeScript (ESM, `"import"`-only per D68), tsup, vitest. pnpm + turbo. Changesets.

## Working dir / Branch

- Working dir: `/Users/rajkaria/Projects/0G-ai-kit`
- Branch: `kits-k7-compute-router` off `main`

## File structure

**Created**

```
packages/0gkit-compute/src/router-select.ts          # selectProviders() pure strategy
packages/0gkit-compute/src/__tests__/router.test.ts
packages/0gkit-compute/src/__tests__/router-select.test.ts
apps/docs/app/concepts/compute-router-vs-direct/page.mdx
docs/research/2026-06-30-0g-router-api.md             # T0 research-gate findings (verified | not)
```

**Modified**

```
packages/0gkit-compute/src/compute.ts                # router() + direct() alias
packages/0gkit-compute/src/index.ts                  # export RouterArgs/RouterResult types
templates/{chat,inference-app,ai-agent}/...          # default to Compute.router()
apps/docs/app/concepts/page.mdx                      # link router-vs-direct
.changeset/k7-compute-router.md                       # compute minor
docs/DECISIONS.md                                     # D86–D88
```

## Task graph

```
T0 RESEARCH GATE (0G Router API: confirm or fall back)
        │
        ▼
T1 selectProviders() pure strategy ──┐
                                      ▼
                           T2 Compute.router()
                                      │
                                      ▼
                           T3 Compute.direct() alias
                                      │
                  ┌───────────────────┴───────────────┐
                  ▼                                     ▼
        T4 templates default router       T5 router-vs-direct docs
                  └───────────────────┬───────────────┘
                                      ▼
                       T6 changeset + D86–D88 + gate
```

---

## Tasks

### T0 — research gate: confirm the 0G Router API

- [ ] **Research** — read the 0G compute / serving docs + the broker SDK surface.
      Answer in `docs/research/2026-06-30-0g-router-api.md`: (a) is there a public
      Router endpoint distinct from per-provider `listService()`? (b) its request
      shape? (c) does it return a provider to call, or proxy the call itself? Cite
      every source URL (honesty rule: cite or mark unverified).
- [ ] **Decide** — if a Router endpoint is **verified**: the adapter calls it. If
      **not verified**: `router()` selects among `listProviders()` results
      (real today) and the docs label it "client-side routing over the provider list
      until 0G ships a server Router." Either way the public `router()` surface below
      is identical — only the internal resolver differs.
- [ ] **Commit**: `docs(research): 0G Router API gate — verified|fallback findings`.

### T1 — `selectProviders()` pure strategy

- [ ] **Failing test** — `packages/0gkit-compute/src/__tests__/router-select.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { selectProviders } from "../router-select.js";

const providers = [
  { provider: "0xA", model: "llama-3.1-8b", endpoint: "https://a" },
  { provider: "0xB", model: "llama-3.1-70b", endpoint: "https://b" },
  { provider: "0xC", model: "llama-3.1-8b", endpoint: "https://c" },
];

describe("selectProviders", () => {
  it("orders providers serving the requested model first", () => {
    const ordered = selectProviders(providers, { model: "llama-3.1-8b" });
    expect(ordered.map((p) => p.provider)).toEqual(["0xA", "0xC", "0xB"]);
  });
  it("honours an explicit `prefer` address as the head", () => {
    const ordered = selectProviders(providers, {
      model: "llama-3.1-8b",
      prefer: "0xC",
    });
    expect(ordered[0].provider).toBe("0xC");
  });
  it("returns all candidates when no model matches (so fallback still tries)", () => {
    const ordered = selectProviders(providers, { model: "ghost" });
    expect(ordered).toHaveLength(3);
  });
});
```

- [ ] **Run** — `pnpm --filter @foundryprotocol/0gkit-compute test` → red.
- [ ] **Implement** — `packages/0gkit-compute/src/router-select.ts`:

```ts
export interface ProviderInfo {
  provider: string;
  model: string;
  endpoint?: string;
}
export function selectProviders(
  providers: ProviderInfo[],
  opts: { model: string; prefer?: string }
): ProviderInfo[] {
  const matches = providers.filter((p) => p.model === opts.model);
  const rest = providers.filter((p) => p.model !== opts.model);
  let ordered = [...matches, ...rest];
  if (opts.prefer) {
    const head = ordered.filter((p) => p.provider === opts.prefer);
    const tail = ordered.filter((p) => p.provider !== opts.prefer);
    ordered = [...head, ...tail];
  }
  return ordered;
}
```

- [ ] **Run** → green. **Commit**: `feat(compute): selectProviders() router strategy`.

### T2 — `Compute.router()`

- [ ] **Failing test** — `packages/0gkit-compute/src/__tests__/router.test.ts`: with an injected `listProviders` returning three providers and an `inference` that throws on the first candidate but succeeds on the second, `router({ model, messages })` resolves with the second provider's output (proves retry+fallback); with one provider, `router()` calls it directly; a request with zero reachable providers throws a typed `NetworkError`.
- [ ] **Run** → red.
- [ ] **Implement** — add to `Compute` in `compute.ts`:

```ts
async router(args: {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  prefer?: string;
  maxAttempts?: number;
}): Promise<InferenceResult> {
  const raw = await this.listProviders();
  const candidates = selectProviders(
    (raw as ProviderInfo[]),
    { model: args.model, prefer: args.prefer }
  );
  if (candidates.length === 0)
    throw new NetworkError(
      `No 0G compute provider is reachable for model '${args.model}'.`,
      `Run \`0g doctor\` to check the broker RPC, or pass { prefer } with a known provider.`
    );
  const limit = Math.min(args.maxAttempts ?? candidates.length, candidates.length);
  let lastErr: unknown;
  for (let i = 0; i < limit; i++) {
    try {
      return await this.inference({
        provider: candidates[i].provider,
        model: args.model,
        messages: args.messages,
        temperature: args.temperature,
      });
    } catch (e) {
      lastErr = e; // try the next candidate
    }
  }
  throw lastErr;
}
```

Import `selectProviders`, `ProviderInfo`, and `NetworkError` (already imported in `compute.ts`). Map `listProviders()`'s untyped `unknown[]` onto `ProviderInfo` defensively.

- [ ] **Run** → green. **Commit**: `feat(compute): Compute.router() — model-first selection + retry/fallback`.

### T3 — `Compute.direct()` back-compat alias

- [ ] **Failing test** — `router.test.ts`: `compute.direct({ provider, messages })` produces the identical result `compute.inference({ provider, messages })` does (same injected broker); the `inference` signature is unchanged (existing inference tests still pass).
- [ ] **Run** → red.
- [ ] **Implement** — add `direct = this.inference.bind(this)` style alias (a thin method that forwards to `inference`) and export `type RouterArgs`/`type RouterResult` from `index.ts`. **No rename** of `inference` (D13) — `direct` is purely additive.
- [ ] **Run** → green. **Commit**: `feat(compute): Compute.direct() alias for the explicit-provider path`.

### T4 — templates default to `router()`

- [ ] **Implement** — in `templates/chat`, `templates/inference-app`, `templates/ai-agent` (the compute-calling templates), switch the inference call from `compute.inference({ provider, ... })` to `compute.router({ model, ... })`, keeping a commented `// compute.direct({ provider }) — if you have your own provider relationship`. Update each template README's compute snippet.
- [ ] **Run** — `pnpm templates:check` → green.
- [ ] **Commit**: `feat(templates): default to Compute.router()`.

### T5 — `compute-router-vs-direct` docs page

- [ ] **Implement** — `apps/docs/app/concepts/compute-router-vs-direct/page.mdx`: when to use each, latency/cost trade-offs, the retry/fallback behaviour, and an honest note carrying the T0 finding ("router selects over the provider list" vs "router hits 0G's Router endpoint"). Link from `apps/docs/app/concepts/page.mdx`. Update the `0gkit-compute` package page with the `router()` API.
- [ ] **Run** — `pnpm docs:check` → green.
- [ ] **Commit**: `docs(compute): router-vs-direct concept + API`.

### T6 — changeset + decisions + gate

- [ ] **Implement** — `.changeset/k7-compute-router.md`: `@foundryprotocol/0gkit-compute` minor (`router()` + `direct()` added; no breaking change).
- [ ] **Implement** — `docs/DECISIONS.md` D86–D88:
  - **D86** — `Compute.router()` is additive; `Compute.inference()` keeps its signature and `Compute.direct()` is a forwarding alias. No rename of the published surface (D13). Templates default to `router()`; `direct()` documented for "I own my provider relationship."
  - **D87** — Until a 0G server Router endpoint is verified (T0 research gate), `router()` selects over `listProviders()` results client-side, with retry/fallback. Labelled as such in docs (honesty rule). Swapping in a confirmed endpoint changes only the internal resolver, not the public surface.
  - **D88** — `router()` works on galileo + local and degrades to the single configured provider; no behaviour gated on Aristotle (D10).
- [ ] **Run** — full gate: `pnpm lint typecheck build test boundary:check templates:check format:check` → all green.
- [ ] **Commit**: `chore(k7): changeset + D86–D88`. Open PR `K7 — Compute Router`. Squash-merge on green CI.

## Self-review checklist

- [ ] T0 research findings recorded with cited sources; no fabricated Router endpoint.
- [ ] `router()` retries across candidates and falls back; zero-provider throws a typed `NetworkError`.
- [ ] `inference()` signature + behaviour unchanged; `direct()` is a pure alias (existing tests pass).
- [ ] Templates default to `router()` with a `direct()` escape hatch commented in.
- [ ] No Aristotle gating; galileo + local + single-provider all work (D10).
- [ ] Docs label whichever resolver shipped (endpoint vs list-select) honestly.
- [ ] Changeset is `0gkit-compute` minor (additive); D86–D88 recorded.
- [ ] No neutrality breach (compute imports only `0gkit-core`); boundary:check green.
