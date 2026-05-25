# @foundryprotocol/0gkit-cli

## 1.3.0

### Minor Changes

- c205c36: SP14: local `0g traces` explorer.
  - `0gkit-observability` mirrors every instrumented span to JSONL when
    `OGKIT_TRACE_DIR` is set. Off by default, fire-and-forget; never replaces
    the configured OTel exporter. New exports: `appendSpanRecord`,
    `defaultTraceDir`, `isSinkEnabled`, `listTraceFiles`, `pathForTrace`,
    `readTraceFile`, `summarizeTrace`, plus `TraceFileEntry`,
    `TraceFileSummary`, `TraceRecord` types.
  - New CLI subcommands: `0g traces list [--last N] [--dir <path>] [--json]`
    and `0g traces inspect <traceId> [--dir <path>] [--json]`. `inspect --json`
    emits a Jaeger-v1-shaped envelope.
  - `0g cost forecast --from-jaeger -` now reads a Jaeger envelope from stdin
    so `inspect --json | cost forecast --from-jaeger -` pipes cleanly.
  - New error codes: `OBSERVABILITY_TRACE_DIR_NOT_SET`,
    `OBSERVABILITY_TRACE_NOT_FOUND`, `OBSERVABILITY_TRACE_READ_FAILED`.

### Patch Changes

- Updated dependencies [c205c36]
  - @foundryprotocol/0gkit-observability@1.3.0
  - @foundryprotocol/0gkit-core@1.3.0
  - @foundryprotocol/0gkit-attestation@1.3.0
  - @foundryprotocol/0gkit-chain@1.3.0
  - @foundryprotocol/0gkit-compute@1.3.0
  - @foundryprotocol/0gkit-contracts@1.3.0
  - @foundryprotocol/0gkit-da@1.3.0
  - @foundryprotocol/0gkit-devnet@1.3.0
  - @foundryprotocol/0gkit-storage@1.3.0

## 1.2.1

### Patch Changes

- Updated dependencies [d964721]
  - @foundryprotocol/0gkit-storage@1.2.1
  - @foundryprotocol/0gkit-compute@1.2.1

## 1.2.0

### Minor Changes

- 6ff20a1: `0g cost forecast` gains `--from-jaeger <path>`: replay a Jaeger v1 trace JSON
  dump, aggregate spans carrying the `0gkit.*` attribute namespace (emitted by
  `@foundryprotocol/0gkit-observability`) into per-op gas + fee totals, and
  report them in human or `--json` form.

  Dry-run spans (`0gkit.dry_run=true`) and errored spans (any `0gkit.error_code`
  tag) are counted but excluded from cost totals — they did not spend on-chain
  resources.

  Mutually exclusive with `--storage` / `--compute` / `--da`.

  ```bash
  0g cost forecast --from-jaeger ./trace.json --json
  ```

## 1.0.2

### Patch Changes

- 378a8de: Fix three broken onboarding paths a fresh dev hits within the first minute:
  - **`create-0gkit-app` tarball 404.** Default `OGKIT_TEMPLATE_REF` was pinned
    to the never-published git tag `v0.3.x`, so every
    `npm create 0gkit-app@latest` died on a `Failed to download
https://api.github.com/repos/rajkaria/0gkit/tarball/v0.3.x: 404` before
    writing a single file. Defaulting to `main` instead — the always-green tip
    protected by the full CI pipeline. v1.x uses per-package npm tags
    (`@foundryprotocol/0gkit-core@1.0.1`), not a floating `v1.0.x` git tag, so
    there is no single tag that tracks the latest stable workspace state.
    `OGKIT_TEMPLATE_REF=<sha-or-tag>` env override unchanged for pinning to a
    specific revision.
  - **CLI version drift.** `0g --version` printed `0.1.0` regardless of which
    release was installed (the constant was hardcoded in `program.ts`). Now read
    from `packages/0gkit-cli/package.json` at runtime via `readFileSync` (same
    pattern `create-0gkit-app` already uses), so `--version` always matches the
    installed tarball.
  - **CLI heavy install.** `@foundryprotocol/0gkit-jobs` (which transitively
    requires the native `better-sqlite3`, ~minutes to compile on first install)
    was a static dependency, so `npm i @foundryprotocol/0gkit-cli` or
    `npx @foundryprotocol/0gkit-cli --help` paid that cost even when the user
    never touched `0g jobs *`. Jobs is now lazy-loaded via a computed-specifier
    dynamic import (same pattern as `loadFoundry`), and removed from
    `dependencies`. Devs who do want jobs subcommands install
    `@foundryprotocol/0gkit-jobs` explicitly; a missing-module error guides
    them.

## 1.0.1

### Patch Changes

- ab359ac: Rebase `ERROR_HELP_BASE` from `https://0gkit.dev/errors/` to
  `https://0gkit.com/errors/` (D38). `0gkit.com` is the canonical landing +
  docs + playground deployment going forward; `0gkit.dev` is held as a
  redirect-only alias so URLs already in v1.0.0 tarballs continue to
  resolve forever.

  Every package.json `homepage` now points to https://0gkit.com so that
  npm package pages link back to the canonical site.

  No API surface changes — `ZeroGError.helpUrl` is still derived from
  `ERROR_HELP_BASE` via `helpUrlFor(code)`; only the constant moves.

- Updated dependencies [ab359ac]
  - @foundryprotocol/0gkit-attestation@1.0.1
  - @foundryprotocol/0gkit-chain@1.0.1
  - @foundryprotocol/0gkit-compute@1.0.1
  - @foundryprotocol/0gkit-contracts@1.0.1
  - @foundryprotocol/0gkit-core@1.0.1
  - @foundryprotocol/0gkit-da@1.0.1
  - @foundryprotocol/0gkit-devnet@1.0.1
  - @foundryprotocol/0gkit-jobs@1.0.1
  - @foundryprotocol/0gkit-storage@1.0.1

## 1.0.0

### Major Changes

- 7bad6be: # 0gkit v1.0.0 — feature-complete, API-stable release

  Phase 4 (SP9–SP12) shipped — the 0gkit toolkit is feature-complete and the public surface is now considered stable. From this point onward we follow strict semver: no breaking changes without a major bump.

  **What's in v1.0.0** (cumulative across all 12 sub-projects):
  - **Primitives** — `0gkit-core` (Networks/viem client/Receipt/Signer/ZeroGError taxonomy) · `0gkit-storage` · `0gkit-compute` · `0gkit-da` · `0gkit-attestation` · `0gkit-chain`.
  - **Wallet** — `0gkit-wallet` (HD + JSON-keystore + raw-key signers) + `0gkit-wallet-react` (wagmi 2.x adapter).
  - **Contracts** — `0gkit-contracts` (wagmi-style typed `read.*` / `write.*` / `events.*` over viem, Foundry codegen, registry placeholders).
  - **Indexer** — `0gkit-indexer` (polling indexer, reorg-safe, memory/sqlite/redis cursor backends) + `useEvent` / `useLogs` in `0gkit-react`.
  - **Jobs** — `0gkit-jobs` (durable runner, memory/sqlite/redis backends, HMAC webhooks, at-least-once delivery).
  - **Observability** — `0gkit-observability` (prototype-patch instrumentation, `0gkit.*` OTel attributes, ≤ 20 KB gz, optional OTel SDK auto-setup).
  - **Testing** — `0gkit-testing` (mocks/fixtures/`testWallet`/`setupLocalDevnet`/vitest matchers).
  - **CLI** — `0gkit-cli` (`0g init / doctor / chain / storage / infer / da / attest / contracts / estimate / jobs / cost`).
  - **MCP** — `0gkit-mcp` (every CLI capability as an MCP tool).
  - **Scaffolder** — `create-0gkit-app` (9 archetypes: storage-app, ai-agent, tee-attested-api, nft-with-storage, chat, react-app, …) with `--ci <github|gitlab|circle|none>`.
  - **Docs site** — Pagefind in-site search · Lighthouse CI ≥ 0.95 gate · per-error-code MDX pages · `docs:check --exports` CI gate.
  - **Error taxonomy** — 45 SCREAMING_SNAKE codes with deterministic `helpUrl` per code · `<ZeroGErrorBoundary>` in React.

  **Stability commitment from v1.0.0:** public API surface frozen until v2.0.0. Bug fixes are patches; new features are minors; only true breaking changes warrant a major.

### Patch Changes

- Updated dependencies [7bad6be]
  - @foundryprotocol/0gkit-attestation@1.0.0
  - @foundryprotocol/0gkit-chain@1.0.0
  - @foundryprotocol/0gkit-compute@1.0.0
  - @foundryprotocol/0gkit-contracts@1.0.0
  - @foundryprotocol/0gkit-core@1.0.0
  - @foundryprotocol/0gkit-da@1.0.0
  - @foundryprotocol/0gkit-devnet@1.0.0
  - @foundryprotocol/0gkit-jobs@1.0.0
  - @foundryprotocol/0gkit-storage@1.0.0

## 0.6.0

### Minor Changes

- 2f7a022: SP11 — `@foundryprotocol/0gkit-observability`. First publish: `instrument0g()`
  patches Storage / Compute / DA prototypes to emit OTel spans with `0gkit.*`
  semantic attributes (`0gkit.network`, `0gkit.op`, `0gkit.size_bytes`,
  `0gkit.gas_native`, `0gkit.fee_native`, `0gkit.confirm_seconds`, `0gkit.root`,
  `0gkit.error_code`, …). Optional auto SDK setup via lazy-imported peers
  (`@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`); bring
  your own SDK with `mode: "attach"`. Bundle ≤ 20 KB gzipped (asserted in CI).
  CLI gains `0g cost forecast` aggregating SP7 estimates across ops. The
  `tee-attested-api` template migrates from `console.log` access logging to
  OTel spans (resolves SP8 D26).

## 0.5.0

### Minor Changes

- 296c1d8: SP10 — `@foundryprotocol/0gkit-jobs`. First publish: durable async job runner
  with memory/sqlite/redis backends, zod-typed `jobs.define()`, HMAC-signed
  webhooks, graceful shutdown for serverless via `AbortSignal`. CLI gains
  `0g jobs status` for read-only inspection of memory/sqlite-backed queues. The
  `ai-agent` template migrates from in-process loop to a `JobRunner` with
  `MemoryBackend` (swap to sqlite/redis for production).

### Patch Changes

- Updated dependencies [296c1d8]
  - @foundryprotocol/0gkit-jobs@0.5.0

## 0.4.0

### Minor Changes

- eca1540: SP9 — Error taxonomy + helpUrl + docs:check CI gate.

  Every `ZeroGError` thrown by any `0gkit-*` package now carries:
  - a stable `code` from the canonical `ERROR_CODES` enum (~45 SCREAMING_SNAKE
    values across CONFIG, WALLET, CHAIN, STORAGE, COMPUTE, DA, ATTESTATION,
    CONTRACTS, INDEXER, JOBS, OBSERVABILITY namespaces — JOBS/OBSERVABILITY are
    forward-defined for SP10/SP11), and
  - a `helpUrl` that resolves to `https://0gkit.dev/errors/<CODE>` with a one-page
    explainer (cause, fix, minimal example).

  `0gkit-react` ships a new `<ZeroGErrorBoundary>` component that catches errors
  thrown inside its subtree and renders the helpUrl as a clickable link. Pass
  `fallback` for full custom rendering, or `onError` for analytics side-effects.

  `0gkit-cli`'s `--json` failure output now includes `helpUrl`; human mode adds a
  `Help: <url>` line under the hint.

  `pnpm docs:check` is wired into CI. Every code thrown in `packages/**/src/**`
  must have a corresponding `apps/docs/app/errors/<CODE>/page.mdx`; missing pages
  or orphan pages fail the build. Static regex extraction — false positives are
  rare and the failure mode is a loud CI run.

  Breaking change for direct callers of `new ZeroGError(code, message, hint)`:
  the `code` argument's union moves from `'CONFIG' | 'NETWORK' | 'CHAIN' |
'ATTESTATION'` to the wider `ErrorCode` (~45 SCREAMING_SNAKE values). The old
  broad codes are no longer accepted — use the specific namespaced equivalents
  (e.g. `CONFIG_MISSING_ENV`, `CHAIN_RPC_UNREACHABLE`,
  `ATTESTATION_BAD_SIGNATURE`). Subclass constructors (`ConfigError`,
  `NetworkError`, `ChainError`, `AttestationError`) preserve their
  `(message, hint)` signatures and default their code based on the namespace, so
  most existing callsites compile unchanged.

### Patch Changes

- Updated dependencies [eca1540]
  - @foundryprotocol/0gkit-core@0.4.0
  - @foundryprotocol/0gkit-storage@0.4.0
  - @foundryprotocol/0gkit-compute@0.4.0
  - @foundryprotocol/0gkit-da@0.4.0
  - @foundryprotocol/0gkit-attestation@0.4.0
  - @foundryprotocol/0gkit-chain@0.4.0
  - @foundryprotocol/0gkit-contracts@0.4.0
  - @foundryprotocol/0gkit-devnet@0.4.0

## 0.3.0

### Minor Changes

- b9e8c23: SP4 — typed contract clients + Foundry codegen.
  - New package `@foundryprotocol/0gkit-contracts` with five standard 0G contracts
    pre-bundled (ERC-20, ERC-721, Multicall3, provider registry, attestation
    verifier) and a wagmi-style `createTypedContract` factory. `.read.method()` /
    `.write.method()` returns a `Receipt` shape, `.events.Event()` pulls logs via
    `viem.getLogs`.
  - `0g contracts generate --abi <foundry-artifact>.json --out <dir>` consumes
    `forge build` output and emits typed `.ts` clients. Output is deterministic
    and passes `tsc --strict --noEmit` with zero `any`.
  - `0g contracts list` and `0g contracts info <name>` for discovery.
  - Honest defaults: contracts that 0G hasn't pinned an address for yet (registry,
    attestation verifier) throw a CONFIG error with a clear hint instead of
    shipping a fabricated address.

- c834d6a: SP7: cost estimator + dry-run. Every primitive answers "what will this cost?" before broadcasting.
  - `0gkit-core`: new `Estimate` / `DryRunResult<T>` envelope + `formatEstimate(est)` + `formatNative(wei)`.
  - `0gkit-storage`: `Storage.estimate(bytes)` + `Storage.upload(bytes, { dryRun: true })`.
  - `0gkit-compute`: `Compute.estimate({ messages, model?, maxOutputTokens? })` + `Compute.inference(args, { dryRun: true })`. Char/4 token heuristic (D21).
  - `0gkit-da`: `DA.estimate(payload)` + `DA.publish(payload, { dryRun: true })`. Default rate `1e6 wei/byte` (D23).
  - `0gkit-contracts`: new `typedContract.estimate.<method>(...args)` namespace using `estimateContractGas` + `getGasPrice`; `write.<method>(args, { dryRun: true })` runs `simulateContract` without broadcasting.
  - `0gkit-cli`: new `0g estimate storage | compute | da | contracts` subcommands + `--dry-run` flag on `0g storage put`, `0g da publish`, `0g infer`.

### Patch Changes

- c4fc6fe: SP5 — `@foundryprotocol/0gkit-testing` ships.
  - New package `@foundryprotocol/0gkit-testing` with `testWallet({ index })`
    (HD-derived from anvil's dev mnemonic — matches devnet account 0 directly),
    `mockStorageClient` / `mockComputeClient` / `mockDAClient` with in-memory
    state for upload→download / chat / publish→verify round-trips,
    `fixtureReceipt` and `fixtureAttestation` for unit-test payloads.
  - `setupLocalDevnet({ autoStart })` — vitest `globalSetup`-friendly wrapper
    over SP2's `0g dev`, lazily importing `0gkit-devnet` so the testing package
    stays light when devnet isn't used.
  - Vitest matchers under the `/matchers` sub-path: `toBeConfirmedOn0G`,
    `toHaveRootMatching`, `toBeValidAttestation`, `toBeZeroGError`. Import once
    via `import "@foundryprotocol/0gkit-testing/matchers"` in your vitest setup.
  - One existing test suite in every `0gkit-*` package migrated to use the
    new mocks/fixtures — proving the API is real, not just demoed.

- Updated dependencies [b9e8c23]
- Updated dependencies [c4fc6fe]
- Updated dependencies [c834d6a]
  - @foundryprotocol/0gkit-contracts@0.3.0
  - @foundryprotocol/0gkit-storage@0.3.0
  - @foundryprotocol/0gkit-compute@0.3.0
  - @foundryprotocol/0gkit-da@0.3.0
  - @foundryprotocol/0gkit-attestation@0.3.0
  - @foundryprotocol/0gkit-core@0.3.0
  - @foundryprotocol/0gkit-chain@0.3.0
  - @foundryprotocol/0gkit-devnet@0.3.0

## 0.2.0

### Minor Changes

- 662eb80: SP2: `0g dev` — a local 0G stack (anvil + storage / compute / DA mocks) that
  starts in under five seconds with 10 prefunded dev accounts. Eliminates the
  Galileo faucet round-trip during development.

  New package `@foundryprotocol/0gkit-devnet` owns the four service mocks (Node
  HTTP, filesystem CAS for storage, OpenAI-compatible compute with Ollama
  auto-detection, in-memory canonical-digest DA) and a deterministic HD-account
  derivation that matches anvil's well-known dev mnemonic.

  New CLI subcommand `0g dev start | stop | status | reset` orchestrates the
  lifecycle. State file lives at `~/.0g-dev/devnet.json`. The standard anvil
  dev mnemonic produces the same accounts you already trust from local
  Hardhat/Foundry workflows.

### Patch Changes

- Updated dependencies [662eb80]
- Updated dependencies [63a297e]
  - @foundryprotocol/0gkit-devnet@0.2.0
  - @foundryprotocol/0gkit-core@0.2.0
  - @foundryprotocol/0gkit-storage@0.2.0
  - @foundryprotocol/0gkit-compute@0.2.0
  - @foundryprotocol/0gkit-da@0.2.0
  - @foundryprotocol/0gkit-attestation@0.2.0
  - @foundryprotocol/0gkit-chain@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [42dbc88]
  - @foundryprotocol/0gkit-storage@0.1.1
  - @foundryprotocol/0gkit-compute@0.1.1
