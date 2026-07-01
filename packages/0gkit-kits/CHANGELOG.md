# @foundryprotocol/0gkit-kits

## 1.7.0

### Patch Changes

- f356a91: K5: doctor --fix + 0g test conformance runner + .0gkit/kits.json manifest
  - `@foundryprotocol/0gkit-testing`: new `runConformance()` orchestrator + conformance suites (storage, compute, da, wallet) — pure functions over injected factories, run offline in CI (D84).
  - `@foundryprotocol/0gkit-cli`: new `0g test` command (lazy-imports `0gkit-testing` via computed specifier per D39) with `--suite/--local/--galileo/--kits` flags; `0g doctor --fix` with per-check `→ run <cmd> to fix` hints + `.env` gen / stale-pin bump / rpc fallback fixers (D85); production seam wired in `cli.ts` (real package.json pins + npm registry `latestVersion`).
  - `@foundryprotocol/0gkit-kits`: `applyKit` now persists `.0gkit/kits.json` applied-kit manifest (`{ applied, base, at }`) — closes the K0 gap where applied-kit state was never recorded (D86).

## 1.6.0

### Minor Changes

- 6ca9f39: K0: Kits engine — overlay scaffolding system with agent-memory reference kit
  - New package `@foundryprotocol/0gkit-kits`: manifest schema (zod), kit registry with base-compat filter, `applyKit` overlay engine (3-tier: lib/adapters/ui), `resolveTiers` for base×kit matrix, giget-based overlay fetch, composition with dedup + cycle safety (`composes[]`), conflict detection (`conflicts[]`). Engine imports only `zod` + `giget` + `node:*` — zero toolkit deps (D78).
  - Reference kit `agent-memory`: lib interface, `mcp-agent` + `react-app` adapters, React UI hook. Kit self-supplies `@foundryprotocol/0gkit-storage` in its own `dependencies` so it is self-sufficient on any base (D80).
  - CLI: new `0g kits list` / `0g kits info <kit>` subcommands; new `0g add <kit>` shorthand applying a kit to the current project.
  - `create-0g-app` / `create-0gkit-app`: `--kits` flag for scaffold-time kit selection; kit picker interactive flow.
  - Boundary rules: `no-kits-engine-to-0gkit` (engine must never import any `@foundryprotocol/*`), `no-kit-overlay-to-foundry-app` (overlays may use `0gkit-*` but never non-0gkit Foundry packages). `boundary:check` scope extended to `templates/_kits`.
  - CI: `kits-check` job in `fresh-machine-smoke.yml` running `pnpm kits:check` on Node 20, 22, 24.

  Decisions: D77 (overlays via giget, not published packages), D78 (engine purity), D79 (3-tier model), D80 (kit composition rules).

### Patch Changes

- caa2b4f: K3: add `inft-studio` and `yield-intel` kits to the registry.
  - `inft-studio` — mint intelligent NFTs with AI-generated media on 0G Storage
    and attested provenance. Typed INFT contract via `Inft.sol` (standard ERC-721
    has no mint); provenance badge is a real EIP-191 signed receipt
    (✓ signature verified — not TEE-quote).
  - `yield-intel` — read-only AI yield analysis with an attested decision log.
    Testnet-default (OG_NETWORK=galileo). Zero execution surface: the public API
    has no execute/trade/swap/send/transfer; a load-bearing negative test enforces
    this invariant for the lifetime of the kit. `DemoBanner` is non-removable.

- f3cb05c: K2 durability: registry embeds `durable-agent` and `live-feed` kits.

  `durable-agent` — resumable multi-step agent loop on 0gkit-jobs with per-step
  durability on 0G Storage (step-completion ledger prevents re-running completed
  steps on restart) and OpenTelemetry span tracing per executed step (noop when
  OTel is not configured). Compatible with all five base templates.

  `live-feed` — reorg-safe live social feed on 0G Storage + 0gkit-indexer. Posts
  are content-addressed blobs in 0G Storage; Indexer reorg-safety is active when
  `OG_FEED_CONTRACT_ADDRESS` is set (storage-only mode otherwise). Includes React
  UI (`useLiveFeed` hook + `FeedStream` component). Compatible with `react-app`
  and `chat` bases.

- f108e13: K1: Verifiable AI kits — ai-oracle, sealed-inference, prediction-market
  - New kit `ai-oracle`: signed AI answers anchored to 0G Storage (default) or on-chain via `Anchor.sol` opt-in. Uses `@foundryprotocol/0gkit-compute` + `@foundryprotocol/0gkit-attestation`. Attestation signs `digestJson(receipt)` via EIP-191 personal-sign (`signMessage`); badge = "✓ signature verified" backed by `recoverSigner` — operator-signed receipt, not TEE-quote. On-chain anchor via `@foundryprotocol/0gkit-contracts` is env-flag-gated (`OG_ANCHOR_ONCHAIN=1`). Compatible bases: `react-app`, `chat`, `tee-attested-api`, `mcp-agent`.
  - New kit `sealed-inference`: signed inference with a React badge (`SealedChat`) that reflects the server's `verified` result — verification is server-side inside `sealedInfer` (sign `digestJson(receipt)` via `signMessage`; recover signer via `recoverSigner`), never hardcoded green. Injected `Attestor` interface for future TEE-quote swapout. Compatible bases: `react-app`, `chat`, `tee-attested-api`, `mcp-agent`.
  - New kit `prediction-market`: AI-resolved proof-anchored prediction market (open → bet → resolve → settle). Composes `ai-oracle` so the engine auto-applies it first; both kits' deps merge into `package.json`. Compatible bases: `react-app`, `chat`, `tee-attested-api`.
  - Registry codegen (`scripts/gen-registry.mjs`) now embeds all 4 kits in `registry.generated.ts`; `kits:check` CI gate is composition-aware (15/15 combos pass).

  Decisions: D81 (honest signed-receipt attestation, injected Attestor seam), D82 (0G Storage anchor default + opt-in on-chain via Anchor.sol), D83 (registry codegen auto-formats output).
