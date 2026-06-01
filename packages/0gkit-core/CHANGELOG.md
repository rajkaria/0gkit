# @foundryprotocol/0gkit-core

## 1.5.0

### Minor Changes

- 006e514: Defect intelligence: turn any `ZeroGError` into a ready-to-file QA defect report.
  - New `buildDefectReport(input)` in `0gkit-core` — renders the bilingual defect template used by the 0G ecosystem app-test program (github.com/lvxuan149/0g-apac-app-test). Auto-fills ownership, suggested severity, environment, actual result, and root-cause from the error; leaves repro/expected/screenshot for the human tester.
  - New `suggestOwnership(code)` — routes infra-class codes (chain/storage/compute/DA/attestation/indexer) to `0G Infra`, integration/config codes to `Hackathon项目`.
  - New `suggestSeverity(code)` — P1 for blockers, P3 for caller-fixable config, P2 otherwise (always rendered as a confirm-against-impact suggestion).
  - Framework-agnostic (no deps) so a browser dApp's error boundary and the CLI emit the same report.
  - CLI: new `--defect-report` global flag emits the report to stderr on error (mirrors `--copy-issue-context`; keeps `--json` stdout clean).

- f59b752: SP16: golden path + typed config
  - New `define0GConfig({ server, client, edge })` typed env reader with zod validation. Server, browser-public (`NEXT_PUBLIC_*`), and edge-runtime slots. Generates an `.env.example` from the schema via `config.envExample()`.
  - New `detectLocalDevnet({ rpcUrl })` — pure chainId probe; templates auto-fall-back to `network=local` when the local devnet is reachable.
  - New `printFirstSuccess({ op, id })` banner helper with `FIRST_SUCCESS_MARKER = "[0gkit:first-success]"` (public contract token for log scrapers).
  - All 9 templates migrated: every template ships `0g.config.ts`, `.env.example` derived from the schema, auto-devnet detection on boot, a first-success banner on the first 0G op, and a "What next?" README section.
  - CI: `fresh-machine-smoke.yml` greps `npm run dev` output for the banner on storage-app.

  Decisions: D71 (banner contract token), D72 (chainId-probe detection), D73 (zod in core).

## 1.3.0

### Patch Changes

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

## 0.3.0

### Minor Changes

- c834d6a: SP7: cost estimator + dry-run. Every primitive answers "what will this cost?" before broadcasting.
  - `0gkit-core`: new `Estimate` / `DryRunResult<T>` envelope + `formatEstimate(est)` + `formatNative(wei)`.
  - `0gkit-storage`: `Storage.estimate(bytes)` + `Storage.upload(bytes, { dryRun: true })`.
  - `0gkit-compute`: `Compute.estimate({ messages, model?, maxOutputTokens? })` + `Compute.inference(args, { dryRun: true })`. Char/4 token heuristic (D21).
  - `0gkit-da`: `DA.estimate(payload)` + `DA.publish(payload, { dryRun: true })`. Default rate `1e6 wei/byte` (D23).
  - `0gkit-contracts`: new `typedContract.estimate.<method>(...args)` namespace using `estimateContractGas` + `getGasPrice`; `write.<method>(args, { dryRun: true })` runs `simulateContract` without broadcasting.
  - `0gkit-cli`: new `0g estimate storage | compute | da | contracts` subcommands + `--dry-run` flag on `0g storage put`, `0g da publish`, `0g infer`.

## 0.2.0

### Minor Changes

- 63a297e: SP3: `0gkit-wallet` + `0gkit-wallet-react`. New `Signer` interface in
  `0gkit-core` adopted by every primitive — `new Storage({ signer })` replaces
  `new Storage({ privateKey })` (legacy stays for one minor with a deprecation
  warning). Loaders: `fromPrivateKey`, `fromFile` (keystore-v3), `fromEnv`
  (auto-picks KMS/file/PK), `fromKMS` (AWS KMS, secp256k1). SIWE: EIP-4361
  nonce/buildMessage/verify. React: `ZeroGWalletProvider` + `useWallet` /
  `useConnect` / `useSwitchNetwork` over wagmi v2.
