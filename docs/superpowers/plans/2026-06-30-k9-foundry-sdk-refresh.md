---
title: K9 — Foundry SDK refresh onto `@foundryprotocol/0gkit-* ^1.x`
date: 2026-06-30
epic: kits
sprint: K9 (old SP21)
spec: ../specs/2026-06-30-0gkit-kits-design.md
roadmap: 2026-06-30-kits-epic-roadmap.md
status: ready
depends_on: []
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

# K9 — Foundry SDK refresh (cross-repo)

## Goal

Make `@foundryprotocol/sdk` a **thin adapter over the published
`@foundryprotocol/0gkit-*` v1.x packages** instead of a parallel implementation
that wraps the official 0G SDKs directly. After K9, `@foundryprotocol/sdk@1.1.0`:

- `storage.ts` → thin adapter over `@foundryprotocol/0gkit-storage`, **public
  `StorageClient` API preserved** (`upload`/`uploadText`/`uploadJson`/`download`/
  `downloadText`/`downloadJson`, the `{ rootHash, txHash, size }` envelope).
- `attestation.ts` → re-exports `@foundryprotocol/0gkit-attestation`, wrapping
  `verifyEnvelope` to keep Foundry's **throw-on-mismatch** semantic.
- `da.ts` → already delegates to `0gkit-da`. No work (verify only).
- `inference.ts` → kept as-is (Foundry-specific proxy with revenue routing).
- Drop `@0gfoundation/0g-storage-ts-sdk` + `ethers` from peerDeps (now transitive
  through `0gkit-storage`).

> **Direction note:** this is the **`@foundryprotocol/sdk` app consuming neutral
> `0gkit-*` packages** — the allowed direction. Neutrality (no `0gkit-*` → Foundry
> dep) is *not* affected by K9; K9 only adds Foundry → `0gkit-*` dependencies.
> **A storage-adapter draft from a prior session transcript can be lifted as the
> T2 starting point** (verify it against the current `0gkit-storage` surface
> before trusting it).

## Dependencies / Architecture

- **This sprint runs on the Foundryprotocol repo, not 0gkit.** Working dir:
  `/Users/rajkaria/Projects/Foundryprotocol`.
- `@foundryprotocol/sdk` currently:
  ([`/Users/rajkaria/Projects/Foundryprotocol/packages/sdk/src/`](file:///Users/rajkaria/Projects/Foundryprotocol/packages/sdk/src/))
  - `storage.ts` exports `StorageClient` / `StorageError` and wraps
    `@0gfoundation/0g-storage-ts-sdk` directly; returns `{ rootHash, txHash, size }`.
  - `attestation.ts` exports `AttestationEnvelope` / `SignedEnvelope` and signs/
    verifies via `viem` + `@foundryprotocol/0gkit-core`'s `digestJson`.
  - `da.ts` already imports `DA` from `@foundryprotocol/0gkit-da` (delegation done).
  - `inference.ts` exports `InferenceClient` (revenue-routing proxy — keep).
  - `package.json` is at `version: 1.0.0`; deps already include
    `@foundryprotocol/0gkit-core@^0.1.0` + `@foundryprotocol/0gkit-da@^0.1.0`;
    peerDeps still list `@0gfoundation/0g-storage-ts-sdk` + `ethers`.
- **The published surface to adopt:** `0gkit-storage`'s `Storage` class
  (`upload`/`download`/`exists`) and `0gkit-attestation`'s `verifyEnvelope`/
  `parseEnvelope`/`reportEnvelope`. Both are at `^1.5.0` on npm.
- **Cross-repo PR sequence:** one PR on the Foundryprotocol repo → CI green →
  publish `@foundryprotocol/sdk@1.1.0` → consumers pin. No 0gkit-repo change.

## Tech Stack

TypeScript (ESM), tsup, vitest, viem. `@foundryprotocol/0gkit-*@^1.x` as direct
deps. Changesets (or the repo's existing version flow).

## Working dir / Branch

- Working dir: `/Users/rajkaria/Projects/Foundryprotocol`
- Branch: `kits-k9-foundry-sdk-refresh` off `main`

## File structure

**Modified** (all under `/Users/rajkaria/Projects/Foundryprotocol/packages/sdk/`)
```
package.json                       # deps: 0gkit-storage + 0gkit-attestation ^1.x;
                                   #       drop 0g-storage-ts-sdk + ethers peerDeps; version 1.1.0
src/storage.ts                     # StorageClient → adapter over 0gkit-storage.Storage
src/attestation.ts                 # re-export 0gkit-attestation; keep throw-on-mismatch verify
src/da.ts                          # verify-only (already delegates)
src/index.ts                       # VERSION "1.1.0"; surface unchanged
src/__tests__/storage.test.ts      # adapter preserves the StorageClient envelope
src/__tests__/attestation.test.ts  # throw-on-mismatch preserved
CHANGELOG.md                       # 1.1.0 entry
```

## Task graph

```
T1 add 0gkit deps, drop old peerDeps ──┐
                                        ▼
                  T2 storage.ts adapter (lift prior draft, verify)
                                        │
                                        ▼
                  T3 attestation.ts re-export + throw-on-mismatch
                                        │
                                        ▼
                  T4 da.ts verify-only + inference.ts untouched
                                        │
                                        ▼
                  T5 bump 1.1.0 + CHANGELOG + full gate
                                        ▼
                  T6 cross-repo publish sequence
```

---

## Tasks

### T1 — adopt `0gkit-storage` + `0gkit-attestation`, drop old peerDeps

- [ ] **Implement** — in `packages/sdk/package.json`: add `"@foundryprotocol/0gkit-storage": "^1.5.0"` and `"@foundryprotocol/0gkit-attestation": "^1.5.0"` to `dependencies`; bump the existing `0gkit-core`/`0gkit-da` pins from `^0.1.0` to `^1.5.0`; remove `@0gfoundation/0g-storage-ts-sdk` and `ethers` from `peerDependencies` + `peerDependenciesMeta` (now transitive via `0gkit-storage`). Keep `viem`, `@langchain/core`, `ai` peers.
- [ ] **Run** — `pnpm install` at the Foundry repo root → lockfile resolves.
- [ ] **Commit**: `chore(sdk): depend on 0gkit-storage/attestation ^1.x; drop 0g-storage-ts-sdk + ethers peers`.

### T2 — `storage.ts` → adapter over `0gkit-storage` (public API preserved)

- [ ] **Failing test** — `packages/sdk/src/__tests__/storage.test.ts`: with an injected `0gkit-storage` `Storage` whose `upload` returns `{ root: "0xroot", tx: { txHash: "0xtx" } }`, `new StorageClient(cfg).uploadJson({ a: 1 }, { signer })` returns `{ rootHash: "0xroot", txHash: "0xtx", size: <bytes> }`; `downloadJson(root)` round-trips an object; the existing `StorageClient` type signatures are unchanged (compile-time assertion).
- [ ] **Run** — `pnpm --filter @foundryprotocol/sdk test` → red.
- [ ] **Implement** — rewrite `src/storage.ts` so `StorageClient` constructs a `0gkit-storage` `Storage` internally and maps:
```ts
import { Storage } from "@foundryprotocol/0gkit-storage";
import type { Hex } from "viem";

export interface UploadResult { rootHash: Hex; txHash: Hex; size: number }

export class StorageClient {
  private readonly storage: Storage;
  constructor(cfg: StorageClientConfig = {}) {
    this.storage = new Storage({
      network: cfg.network ?? "aristotle",
      rpcUrl: cfg.rpcUrl,
      // signer is passed per-call (preserves the existing per-upload signer API)
    });
  }
  async upload(data: Uint8Array, opts: UploadOptions): Promise<UploadResult> {
    const r = await this.storage.upload(data, { signer: opts.signer as never });
    return {
      rootHash: normalizeHex(r.root),
      txHash: normalizeHex(r.tx.txHash ?? "0x"),
      size: data.length,
    };
  }
  async uploadText(text: string, opts: UploadOptions) {
    return this.upload(new TextEncoder().encode(text), opts);
  }
  async uploadJson(doc: unknown, opts: UploadOptions) {
    return this.uploadText(JSON.stringify(doc), opts);
  }
  async download(rootHash: Hex): Promise<Uint8Array> {
    return this.storage.download(rootHash);
  }
  async downloadText(rootHash: Hex): Promise<string> {
    return new TextDecoder().decode(await this.download(rootHash));
  }
  async downloadJson<T = unknown>(rootHash: Hex): Promise<T> {
    return JSON.parse(await this.downloadText(rootHash)) as T;
  }
}
```
  Keep `StorageError` exported (re-throw `0gkit-storage` errors wrapped to preserve the type). **Lift the prior-session storage-adapter draft here** — but re-verify each method name against the current `0gkit-storage` `Storage` surface (`upload`/`download`/`exists`) before trusting it.
- [ ] **Run** → green. **Commit**: `refactor(sdk): StorageClient is a thin adapter over 0gkit-storage (API preserved)`.

### T3 — `attestation.ts` → re-export `0gkit-attestation` + throw-on-mismatch

- [ ] **Failing test** — `packages/sdk/src/__tests__/attestation.test.ts`: a valid signed envelope verifies; a tampered digest causes the SDK's `verifyEnvelope` wrapper to **throw** (not return `{ ok: false }`) — preserving Foundry's throw-on-mismatch contract; `AttestationEnvelope`/`SignedEnvelope` types still export.
- [ ] **Run** → red.
- [ ] **Implement** — `src/attestation.ts` re-exports `parseEnvelope`/`reportEnvelope`/types from `@foundryprotocol/0gkit-attestation`, and wraps its `verifyEnvelope`:
```ts
import { verifyEnvelope as coreVerify } from "@foundryprotocol/0gkit-attestation";
export async function verifyEnvelope(signed: SignedEnvelope, signer: string): Promise<true> {
  const result = await coreVerify(signed as never, signer);
  if (!result.ok)
    throw new AttestationError(
      `Attestation verification failed: ${result.checks.filter((c) => !c.ok).map((c) => c.name).join(", ")}`
    );
  return true; // Foundry callers rely on throw-on-mismatch
}
```
  Keep the `AttestationEnvelope`/`SignedEnvelope` type re-exports so `index.ts` is unchanged.
- [ ] **Run** → green. **Commit**: `refactor(sdk): attestation.ts re-exports 0gkit-attestation; keeps throw-on-mismatch`.

### T4 — `da.ts` verify-only + `inference.ts` untouched

- [ ] **Verify** — confirm `src/da.ts` already imports `DA` from `@foundryprotocol/0gkit-da` and needs no change beyond the `^1.x` pin bump from T1. Run the existing DA tests.
- [ ] **Verify** — confirm `src/inference.ts` (`InferenceClient`, revenue-routing proxy) is untouched and its tests pass. Do **not** route it through `0gkit-compute` in K9 (revenue routing is Foundry-specific; out of scope).
- [ ] **Run** — `pnpm --filter @foundryprotocol/sdk test` → green.
- [ ] **Commit**: `test(sdk): confirm da.ts delegation + inference.ts unchanged under ^1.x`.

### T5 — bump to 1.1.0 + CHANGELOG + full gate

- [ ] **Implement** — set `package.json` `version` to `1.1.0` and `src/index.ts` `VERSION = "1.1.0"`. Add a `CHANGELOG.md` `1.1.0` entry: "Storage + attestation now adapt the published `@foundryprotocol/0gkit-*` v1.x packages; `0g-storage-ts-sdk` + `ethers` dropped from peers (transitive); public `StorageClient`/attestation surface unchanged." (Minor: API preserved.)
- [ ] **Run** — full gate at the Foundry repo: `pnpm lint typecheck build test` → all green. Confirm the published `StorageClient` + attestation type surface is byte-identical (run the SDK's public-API snapshot test if present, else `tsc` against a consumer fixture).
- [ ] **Commit**: `chore(sdk): bump @foundryprotocol/sdk to 1.1.0 + CHANGELOG`. Open PR `K9 — Foundry SDK refresh onto 0gkit-* ^1.x`. Squash-merge on green CI.

### T6 — cross-repo publish sequence

- [ ] **Sequence** — after the Foundry-repo PR merges: (1) publish `@foundryprotocol/sdk@1.1.0` via the Foundry repo's release flow; (2) verify on npm (`npm view @foundryprotocol/sdk version` → `1.1.0`); (3) update any in-repo consumers to pin `^1.1.0`. **Carry-forward gotcha (from CLAUDE.md):** if the Release run 404s on PUT for all packages, the npm automation token has expired — rotate `NPM_TOKEN` and re-run.
- [ ] **Verify** — a downstream consumer installs `@foundryprotocol/sdk@1.1.0` cleanly with no `@0gfoundation/0g-storage-ts-sdk`/`ethers` peer warning.

## Self-review checklist

- [ ] `StorageClient` public API is byte-identical (upload/uploadText/uploadJson/download/downloadText/downloadJson; `{ rootHash, txHash, size }`).
- [ ] `verifyEnvelope` still **throws** on mismatch (Foundry contract preserved), not `{ ok: false }`.
- [ ] `@0gfoundation/0g-storage-ts-sdk` + `ethers` removed from peerDeps + meta; no consumer peer warning.
- [ ] `da.ts` delegation + `inference.ts` revenue proxy unchanged; their tests pass.
- [ ] Version is `1.1.0` (minor — API preserved); `index.ts` VERSION matches; CHANGELOG updated.
- [ ] This is Foundry→`0gkit-*` only — neutrality (no `0gkit-*`→Foundry) untouched.
- [ ] Cross-repo publish sequence noted incl. the `NPM_TOKEN`-expiry gotcha.
- [ ] Prior-session storage-adapter draft was re-verified against the current `0gkit-storage` surface before reuse.
