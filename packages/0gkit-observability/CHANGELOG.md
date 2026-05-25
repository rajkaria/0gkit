# @foundryprotocol/0gkit-observability

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
  - @foundryprotocol/0gkit-core@1.3.0

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
  - @foundryprotocol/0gkit-core@1.0.1

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
  - @foundryprotocol/0gkit-core@1.0.0

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
