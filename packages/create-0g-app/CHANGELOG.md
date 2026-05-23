# create-0g-app

## 1.0.1

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

- 3b430a2: SP12 — Polish + community + v1.0.0 prep.
  - `--ci <github|gitlab|circle|none>` flag on `create-0gkit-app` scaffolds
    the chosen CI workflow files alongside the template.
  - Vercel "Deploy" buttons on all 9 template READMEs and the docs
    `templates` page.
  - Issue / PR / Discussion templates: bug.yml, feature.yml, security.md,
    rfc.md, plus help.yml / show-and-tell.yml / rfcs.yml under
    `.github/DISCUSSION_TEMPLATE/`.
  - `CONTRIBUTING.md` refresh (8 sections: setup, tests, templates, error
    codes, sub-project plans, changesets, DCO sign-off, code of conduct)
    - Contributor Covenant 2.1 contact wired.
  - `pnpm docs:check` gains an `--exports` mode that asserts every public
    export of every `0gkit-*` package is documented.
  - Pagefind in-site search wired into the docs layout (lazy-loaded on
    focus, ⌘K shortcut).
  - Lighthouse CI workflow with a ≥ 0.95 gate across
    performance/a11y/best-practices/SEO.
  - Decisions D35–D37.

## 0.3.2

### Patch Changes

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

## 0.3.1

### Patch Changes

- 296c1d8: SP10 — `@foundryprotocol/0gkit-jobs`. First publish: durable async job runner
  with memory/sqlite/redis backends, zod-typed `jobs.define()`, HMAC-signed
  webhooks, graceful shutdown for serverless via `AbortSignal`. CLI gains
  `0g jobs status` for read-only inspection of memory/sqlite-backed queues. The
  `ai-agent` template migrates from in-process loop to a `JobRunner` with
  `MemoryBackend` (swap to sqlite/redis for production).

## 0.3.0

### Minor Changes

- 61cd0a9: SP8 — Template expansion: ship the five canonical archetypes.

  Adds `chat`, `ai-agent`, `tee-attested-api`, `nft-with-storage` to the
  `--template` registry. Refreshes `storage-app` with SP7 dry-run preflight
  and dedup. Default `OGKIT_TEMPLATE_REF` bumped from `v0.2.x` → `v0.3.x` so
  new scaffolds resolve against `@foundryprotocol/0gkit-*@0.3.0`.

  Each template ships a tutorial-style README, vitest tests via inline fakes
  matching the published 0gkit API surface, and a `pnpm dev` script that
  integrates with `0g dev` where applicable. SP10 / SP11 hand-off paths are
  documented inline in the `ai-agent` and `tee-attested-api` READMEs.

## 0.2.0

### Minor Changes

- 89148d3: SP1: `npm create 0g-app@latest <name>` scaffolds a runnable 0G app in seconds.
  Templates: storage-app, inference-app, attestation-verify, mcp-agent, react-app.
  Pairs with SP2's `0g dev` for zero-faucet local development.
  `create-0gkit-app` is a defensive alias that redirects to the canonical name.
