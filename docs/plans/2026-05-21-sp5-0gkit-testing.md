# SP5 — `@foundryprotocol/0gkit-testing` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert test-writing from a tax to a feature. Ship `@foundryprotocol/0gkit-testing` — mock providers for storage/compute/DA, deterministic `testWallet`, fixture factories for receipts and attestations, a `setupLocalDevnet()` helper that wraps SP2, and four vitest matchers (`toBeConfirmedOn0G`, `toHaveRootMatching`, `toBeValidAttestation`, `toBeZeroGError`). After SP5, every test for a 0G primitive runs in milliseconds without touching Galileo, and the existing `0gkit-*` packages migrate one suite each to prove the mock API is real, not just demoed.

**Architecture:**

- **Layer 2 `0gkit-testing`** is a new Node/universal package. Deps: `0gkit-core` (Signer / Receipt / ZeroGError types), `0gkit-devnet` (workspace dep, used only by `setupLocalDevnet` via lazy dynamic import so consumers that don't call it don't pay the install cost), `viem` (for HD signer derivation and signature recovery in matchers).
- **Mocks are interface-compatible** with the real primitive classes — `mockStorageClient()` returns an object with the same shape as `new Storage(...)` (`upload`, `download`, `exists`), with deterministic root-hash generation (sha256 of input bytes prefixed `0x`). Same for compute/DA.
- **Fixtures are pure functions** — `fixtureReceipt(over?)` builds a default `Receipt` with deterministic txHash/blockNumber/latencyMs that callers can override. `fixtureAttestation(over?)` produces a signed envelope that round-trips through `0gkit-attestation.verifyEnvelope` (we use a fixed test private key for the signer; documented as test-only).
- **`testWallet`** is a deterministic HD-derived `Signer` implementing the `0gkit-core.Signer` interface. Reuses the same `DEFAULT_DEV_MNEMONIC` as `0gkit-devnet/accounts.ts` so a `testWallet({ index: 0 })` matches anvil's pre-funded account 0.
- **`setupLocalDevnet({ autoStart })`** returns `{ start, stop, handle }` for use in vitest `globalSetup`/`beforeAll`. Lazily imports `0gkit-devnet` so the testing package stays light when devnet isn't needed.
- **Matchers** live in a separate `/matchers` sub-path so they only register when imported (`import "@foundryprotocol/0gkit-testing/matchers"`). Each matcher is independently importable too for cherry-picking.

**Tech Stack:** Node 20+ ESM, TypeScript 5.6, `viem ^2.21` (HD derivation + signature recovery for matchers), `vitest ^2` (peer dependency for matcher types). Prettier-first.

**Decisions referenced:** D3 (neutrality CI gate), D9 (flat SCREAMING_SNAKE error codes), D11 (`Signer` in core). New: **D17 — testing package re-uses anvil's dev mnemonic so `testWallet({index: 0})` matches devnet account 0**, **D18 — matchers live under `/matchers` sub-path and self-register on import**.

**Depends on:** SP2 (`0g dev` for `setupLocalDevnet`), SP3 (`Signer` for `testWallet`), SP4 indirectly (not required for SP5 but `fixtureReceipt` will be shared with codegen'd contracts' write tests). Pure additive otherwise.

**Hard invariants:**

- `0gkit-testing` is under `packages/0gkit-*/` so boundary rules auto-apply.
- Mock outputs are **deterministic**: same input → same root/txHash. Snapshot-tested.
- Test suites that migrate to mocks must keep their _coverage parity_ — we don't lower bars to fit the mock.
- Matcher messages are actionable: every failure message says **what was expected, what was received, and (when possible) a one-line hint**.
- Coverage **80% lines / 70% branches** on `0gkit-testing` (same gate as primitives — most of the code is itself test scaffolding so coverage comes for free).

---

## File Structure

**Create — `0gkit-testing`:**

- `packages/0gkit-testing/package.json`
- `packages/0gkit-testing/tsconfig.json`
- `packages/0gkit-testing/tsup.config.ts`
- `packages/0gkit-testing/vitest.config.ts`
- `packages/0gkit-testing/README.md`
- `packages/0gkit-testing/LICENSE`
- `packages/0gkit-testing/CHANGELOG.md`
- `packages/0gkit-testing/src/index.ts` — public exports for the main entry
- `packages/0gkit-testing/src/types.ts` — shared types
- `packages/0gkit-testing/src/test-wallet.ts` — `testWallet({ index })` deterministic Signer
- `packages/0gkit-testing/src/mocks/storage.ts` — `mockStorageClient()`
- `packages/0gkit-testing/src/mocks/compute.ts` — `mockComputeClient()`
- `packages/0gkit-testing/src/mocks/da.ts` — `mockDAClient()`
- `packages/0gkit-testing/src/fixtures/receipt.ts` — `fixtureReceipt(over?)`
- `packages/0gkit-testing/src/fixtures/attestation.ts` — `fixtureAttestation(over?)`
- `packages/0gkit-testing/src/setup-devnet.ts` — `setupLocalDevnet(opts)`
- `packages/0gkit-testing/src/matchers/index.ts` — self-registers all matchers on import
- `packages/0gkit-testing/src/matchers/types.ts` — Vitest matcher interface augmentation
- `packages/0gkit-testing/src/matchers/to-be-confirmed-on-0g.ts`
- `packages/0gkit-testing/src/matchers/to-have-root-matching.ts`
- `packages/0gkit-testing/src/matchers/to-be-valid-attestation.ts`
- `packages/0gkit-testing/src/matchers/to-be-zero-g-error.ts`
- `packages/0gkit-testing/src/__tests__/test-wallet.test.ts`
- `packages/0gkit-testing/src/__tests__/mocks.test.ts`
- `packages/0gkit-testing/src/__tests__/fixtures.test.ts`
- `packages/0gkit-testing/src/__tests__/setup-devnet.test.ts`
- `packages/0gkit-testing/src/__tests__/matchers.test.ts`
- `packages/0gkit-testing/src/__tests__/boundary.test.ts`

**Modify — existing packages (one migrated suite each, proving the API):**

- `packages/0gkit-storage/src/__tests__/storage.test.ts` — add a `mockStorageClient` round-trip suite alongside the existing real-SDK suite. **Do not** remove existing coverage.
- `packages/0gkit-compute/src/__tests__/compute.test.ts` — add a `mockComputeClient` suite (deterministic response).
- `packages/0gkit-da/src/__tests__/da.test.ts` — add `mockDAClient` suite.
- `packages/0gkit-attestation/src/__tests__/<*>.test.ts` — add a `fixtureAttestation` + `toBeValidAttestation` matcher suite.
- `packages/0gkit-cli/src/__tests__/<one>.test.ts` — pick one (e.g. `chain.test.ts`) and migrate its `fakeDeps` to use `fixtureReceipt` instead of hand-rolled `tx: { txHash, latencyMs }` objects.
- `packages/0gkit-contracts/src/__tests__/factory.test.ts` — replace the inline `fakePublicClient`/`fakeWalletClient` with mocks driven by `fixtureReceipt`.

**Modify — workspace:**

- `pnpm-workspace.yaml` — no change.
- `.github/workflows/ci.yml` — no new job; the new package is picked up by `pnpm build/test/typecheck`.
- `.changeset/sp5-testing.md` — new minor changeset for `0gkit-testing` (first publish) + patch entries for every package whose test suite migrated.
- `docs/DECISIONS.md` — append D17, D18.
- `docs/specs/2026-05-20-essentials-roadmap.md` — mark SP5 status complete after merge.
- `README.md` — add `@foundryprotocol/0gkit-testing` row to the package matrix.

---

## Tasks

### Task 1: Scaffold `0gkit-testing` package skeleton

- [ ] Create `packages/0gkit-testing/package.json` mirroring `0gkit-contracts`:
  - `name`: `@foundryprotocol/0gkit-testing`
  - `description`: `"Test toolkit for 0gkit: deterministic mock providers for storage/compute/DA, signed fixture attestations + receipts, an HD-derived testWallet, a setupLocalDevnet() vitest helper that wraps `0g dev`, and four vitest matchers (toBeConfirmedOn0G, toHaveRootMatching, toBeValidAttestation, toBeZeroGError)."`
  - `dependencies`: `@foundryprotocol/0gkit-core: workspace:*`, `viem: ^2.21.0`
  - `peerDependencies`: `viem: ^2.21.0`, `vitest: ^2.1.8`
  - `peerDependenciesMeta`: `{ "vitest": { "optional": false } }`
  - `devDependencies`: `@foundryprotocol/0gkit-devnet: workspace:*` (lazy-imported by `setupLocalDevnet`), `@types/node`, `@vitest/coverage-v8`, `dependency-cruiser`, `rimraf`, `tsup`, `typescript`, `vitest`
  - `exports`: `"."` (main), `"./matchers"` (self-registering matchers), `"./mocks"` (mock-only entry for tree-shaking), `"./fixtures"` (fixtures-only entry)
- [ ] `tsconfig.json` — same as `0gkit-contracts`.
- [ ] `tsup.config.ts` — emit four entries (`index`, `matchers`, `mocks`, `fixtures`); externalize viem, vitest, `0gkit-core`, `0gkit-devnet`.
- [ ] `vitest.config.ts` — 80/80/80/70 thresholds, exclude `src/index.ts` and `src/matchers/index.ts` (self-registration shim) from coverage include.
- [ ] `README.md`, `LICENSE` (MIT), `CHANGELOG.md` (empty header).

**Acceptance:** `pnpm install` succeeds; `pnpm --filter @foundryprotocol/0gkit-testing build` produces four `.js` + `.d.ts` pairs.

### Task 2: `testWallet({ index? })` — deterministic Signer

- [ ] `src/test-wallet.ts`:

  ```ts
  import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
  import type { Signer } from "@foundryprotocol/0gkit-core";

  export const TEST_MNEMONIC =
    "test test test test test test test test test test test junk";

  export interface TestWalletOptions {
    /** HD index from the standard dev mnemonic (defaults to 0). */
    index?: number;
    /** Override the mnemonic — rare, mostly for cross-network parity tests. */
    mnemonic?: string;
  }

  export function testWallet(opts: TestWalletOptions = {}): Signer { ... }
  ```

- [ ] Implementation uses `mnemonicToAccount` to derive the account at `addressIndex`, extracts the HD private key, then wraps the viem account's `signMessage` / `signTypedData` / `sendTransaction` so the returned object exactly matches the `Signer` interface (including the `source: "test-wallet"` field and exposed `privateKey`).
- [ ] Matches the same mnemonic as `0gkit-devnet/accounts.ts:DEFAULT_DEV_MNEMONIC`, so `testWallet({ index: 0 })` matches anvil's prefunded account 0. Documented in code + README.

**Acceptance:** `__tests__/test-wallet.test.ts` asserts (a) `testWallet({ index: 0 }).address` matches the well-known dev mnemonic index-0 address (`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`), (b) the returned signer round-trips a `signMessage` ↔ `recover` test against a known plaintext, (c) overriding `mnemonic` produces a different address.

### Task 3: Mock storage / compute / DA clients

- [ ] `src/mocks/storage.ts` — `mockStorageClient(opts?)` returns:

  ```ts
  interface MockStorage {
    upload(data: Uint8Array): Promise<{ root: string; tx: Receipt; raw: object }>;
    download(root: string): Promise<Uint8Array>;
    exists(root: string): Promise<boolean>;
    /** Test inspection — peek the in-memory blob store. */
    store(): ReadonlyMap<string, Uint8Array>;
  }
  ```

  Internals: sha256-over-bytes Merkle-root substitute, in-memory `Map<root, bytes>` for round-trip download, deterministic `tx` via `fixtureReceipt`.

- [ ] `src/mocks/compute.ts` — `mockComputeClient(opts?)` returns:

  ```ts
  interface MockCompute {
    chat(messages: Array<{ role: string; content: string }>): Promise<{
      role: "assistant";
      content: string;
      raw: object;
      tx: Receipt;
    }>;
    discover(): Promise<{ providers: Array<{ id: string; url: string }> }>;
  }
  ```

  Default behavior: deterministic echo (`echo: <last user message>`) so tests assert on stable strings. `opts.responder?: (messages) => string` overrides.

- [ ] `src/mocks/da.ts` — `mockDAClient()` returns:

  ```ts
  interface MockDA {
    publish(bytes: Uint8Array): Promise<{ digest: string; tx: Receipt }>;
    verify(digest: string, bytes: Uint8Array): Promise<boolean>;
  }
  ```

  Internals: sha256(bytes) → digest; in-memory `Map<digest, bytes>` for `verify` parity.

- [ ] All three mocks expose a `__inspect()` method for tests that want to peek state without abusing private fields.

**Acceptance:** `__tests__/mocks.test.ts` covers upload→download round-trip, exists check, compute echo and override, DA publish→verify (including a "tampered bytes" negative case).

### Task 4: Fixture factories

- [ ] `src/fixtures/receipt.ts` — `fixtureReceipt(over?: Partial<Receipt>): Receipt`:

  ```ts
  export function fixtureReceipt(over: Partial<Receipt> = {}): Receipt {
    return {
      txHash: "0x" + "ab".repeat(32),
      blockNumber: 100n,
      latencyMs: 5,
      ...over,
    };
  }
  ```

- [ ] `src/fixtures/attestation.ts` — `fixtureAttestation(over?)` produces a real signed envelope that round-trips through `@foundryprotocol/0gkit-attestation`. Uses a fixed test private key (clearly documented as test-only; not stored in env).

**Acceptance:** `__tests__/fixtures.test.ts` covers (a) `fixtureReceipt` defaults + overrides, (b) `fixtureAttestation` produces a valid envelope (the test imports `verifyEnvelope` from `0gkit-attestation` only inside the test, NOT in the package's runtime — keeps boundary green).

### Task 5: `setupLocalDevnet`

- [ ] `src/setup-devnet.ts`:

  ```ts
  export interface SetupLocalDevnetOptions {
    autoStart?: boolean;
    rpcPort?: number;
    storagePort?: number;
    computePort?: number;
    daPort?: number;
  }

  export interface DevnetTestHandle {
    /** Manually start (when autoStart is false). */
    start: () => Promise<void>;
    /** Stop the spawned services. */
    stop: () => Promise<void>;
    /** Currently-active devnet handle (undefined before start). */
    handle?: unknown;
  }

  export async function setupLocalDevnet(
    opts?: SetupLocalDevnetOptions
  ): Promise<DevnetTestHandle>;
  ```

- [ ] Implementation lazily `await import("@foundryprotocol/0gkit-devnet")` inside `start()` — keeps the testing package free of devnet's anvil/storage spawn surface at import time. Calls `startDevnet({ detach: true })` so the test process can exit cleanly; `stop()` calls `stopDevnet()`.
- [ ] Documented usage in README: `vitest.config.ts` `globalSetup` integration, plus `beforeAll`/`afterAll` per-suite.

**Acceptance:** `__tests__/setup-devnet.test.ts` mocks the dynamic import (using `vi.mock` to replace `0gkit-devnet`) and asserts start/stop are called once each.

### Task 6: Vitest matchers

- [ ] `src/matchers/types.ts` — ambient module augmentation that adds the four matchers to `Vi.Assertion`/`Vi.AsymmetricMatchersContaining`.
- [ ] `src/matchers/to-be-confirmed-on-0g.ts`:

  ```ts
  expect.extend({
    toBeConfirmedOn0G(received: unknown) {
      // Accepts a Receipt-like object; asserts txHash matches /^0x[0-9a-f]{64}$/i,
      // blockNumber is a positive bigint, latencyMs is a non-negative number.
      ...
    },
  });
  ```

- [ ] `src/matchers/to-have-root-matching.ts` — accepts a string (the root); asserts it matches a regex AND looks like `^0x[0-9a-f]{64}$` (a 32-byte hex string). Useful for "did upload return a root in the right shape" assertions.
- [ ] `src/matchers/to-be-valid-attestation.ts` — accepts an envelope (bytes/object); uses a lazy import of `0gkit-attestation.verifyEnvelope` to check it. The lazy import keeps the testing package boundary green.
- [ ] `src/matchers/to-be-zero-g-error.ts` — accepts an error and an expected `code`; asserts instance is `ZeroGError`, the `code` matches.
- [ ] `src/matchers/index.ts` — imports each matcher file for its side effect (each calls `expect.extend` at module top level). Users add `import "@foundryprotocol/0gkit-testing/matchers"` in their `vitest.setup.ts`.

Every failure message includes:

1. What was expected.
2. What was received.
3. A one-line hint (e.g., "Did you forget to `await` the upload? Receipt.txHash is missing.").

**Acceptance:** `__tests__/matchers.test.ts` covers each matcher's pass and fail paths, asserting on the failure message text.

### Task 7: Boundary test

- [ ] `__tests__/boundary.test.ts` mirrors the existing pattern — assert no static imports of `@foundryprotocol/*` outside `0gkit-*`. Note: the `setupLocalDevnet` lazy import is a _dynamic_ import and isn't caught by the boundary regex; this is intentional (and matches the existing pattern in `0gkit-cli/src/foundry-loader.ts` D4).

**Acceptance:** boundary test green; `pnpm boundary:check` green.

### Task 8: Migrate existing suites to use the testing package

For each of: `0gkit-storage`, `0gkit-compute`, `0gkit-da`, `0gkit-attestation`, `0gkit-cli`, `0gkit-contracts`:

- [ ] Add `@foundryprotocol/0gkit-testing: workspace:*` to `devDependencies`.
- [ ] Pick **one** existing test file and add a new `describe(...)` block that exercises the migrated path using mocks/fixtures from the testing package. Don't remove existing coverage; this is additive proof-of-API.
- [ ] For `0gkit-contracts/__tests__/factory.test.ts`: replace the inline `fakePublicClient` / `fakeWalletClient` constructors with helpers from the testing package (a new `mockViemClients()` utility lives in `src/mocks/viem.ts` if it's small — otherwise leave inline and just have factory.test.ts pull `fixtureReceipt` for the write-receipt expectation).
- [ ] For `0gkit-cli`: pick `chain.test.ts` or `storage.test.ts`, and use `fixtureReceipt` in the `fakeDeps()` builder.

**Acceptance:** every migrated package's `pnpm --filter <pkg> test` stays green AND each package shows at least one new test calling into `@foundryprotocol/0gkit-testing`.

### Task 9: Wire docs + changeset + roadmap + decisions

- [ ] `packages/0gkit-testing/README.md` — full readme: quickstart, matchers reference, mocks API, fixtures, `setupLocalDevnet`, integration with vitest.
- [ ] Root `README.md` — add `@foundryprotocol/0gkit-testing` row to the package matrix.
- [ ] `docs/DECISIONS.md` — append D17, D18.
- [ ] `docs/specs/2026-05-20-essentials-roadmap.md` — mark SP5 status complete + PR link (after merge).
- [ ] `.changeset/sp5-testing.md`:

  ```md
  ---
  "@foundryprotocol/0gkit-testing": minor
  "@foundryprotocol/0gkit-storage": patch
  "@foundryprotocol/0gkit-compute": patch
  "@foundryprotocol/0gkit-da": patch
  "@foundryprotocol/0gkit-attestation": patch
  "@foundryprotocol/0gkit-cli": patch
  "@foundryprotocol/0gkit-contracts": patch
  ---

  SP5 — `@foundryprotocol/0gkit-testing` ships.

  - `testWallet({ index })` — deterministic HD Signer matching anvil dev
    account 0; `mockStorageClient` / `mockComputeClient` / `mockDAClient`
    with in-memory state for upload→download round-trips; `fixtureReceipt`
    - `fixtureAttestation` for unit-test payloads.
  - `setupLocalDevnet({ autoStart })` — vitest globalSetup-friendly wrapper
    over SP2's `0g dev`.
  - Vitest matchers: `toBeConfirmedOn0G`, `toHaveRootMatching`,
    `toBeValidAttestation`, `toBeZeroGError`. Imported via
    `import "@foundryprotocol/0gkit-testing/matchers"`.
  - One existing test suite in every `0gkit-*` package migrated to use the
    new mocks/fixtures — proving the API is real, not just demoed.
  ```

**Acceptance:** all listed files present + committed.

### Task 10: Full CI green + open PR + squash-merge

- [ ] From `0G-ai-kit` root: `pnpm install && pnpm build && pnpm format:check && pnpm lint && pnpm boundary:check && pnpm typecheck && pnpm test && pnpm templates:check` — all green.
- [ ] Push branch, open PR titled `feat(testing): SP5 — @foundryprotocol/0gkit-testing (mocks + fixtures + matchers + setupLocalDevnet)`. Body covers (a) testing package, (b) matchers, (c) migrated suites, (d) decisions D17–D18.
- [ ] Wait for CI green, then `gh pr merge --squash --auto --delete-branch`.
- [ ] After merge, on local `main`: `git pull`, edit roadmap spec to backfill PR URL.

**Acceptance:** PR squash-merged. Roadmap reflects SP5 = ✅.

---

## Decisions (to append to DECISIONS.md after Task 9)

### D17 — `testWallet` re-uses anvil's dev mnemonic

**Date:** 2026-05-21 · **SP:** SP5

`testWallet({ index: 0 })` produces a Signer derived from the same `"test test test test test test test test test test test junk"` mnemonic that `0g dev`'s anvil pre-funds. So a test that hits the local devnet with `testWallet({ index: 0 })` immediately has gas, no faucet round-trip required. The mnemonic is the universal "anvil dev seed" — every Ethereum dev recognizes it.

### D18 — Matchers live under `/matchers` sub-path, self-register on import

**Date:** 2026-05-21 · **SP:** SP5

`import "@foundryprotocol/0gkit-testing/matchers"` is a side-effect import — each matcher file calls `expect.extend(...)` at top level. The sub-path means users who don't need matchers (or only need the mocks) don't pay the dependency cost. Mirrors how `chai-as-promised` and `jest-dom` work — the pattern is industry-standard.

---

## Out of scope (deferred)

- **MSW-style HTTP request mocking** — useful for compute providers' OpenAI shim, but out of scope for v0. Use `vi.mock` against the underlying fetch instead.
- **`testWallet` for KMS / wagmi shapes** — v0 only emits the privateKey-backed signer. KMS test fixtures land with SP10 (`0gkit-jobs`) when the queue worker pattern needs them.
- **Snapshot tests for matchers' failure messages** — left to follow-up because the messages will evolve as we learn from real usage.
