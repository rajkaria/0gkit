# @foundryprotocol/0gkit-mcp

## 1.12.1

### Patch Changes

- Updated dependencies [8cdb747]
  - @foundryprotocol/0gkit-storage@1.12.1

## 1.12.0

### Patch Changes

- Updated dependencies [0b4eef4]
  - @foundryprotocol/0gkit-storage@1.12.0

## 1.9.0

### Patch Changes

- Updated dependencies [5299ad3]
  - @foundryprotocol/0gkit-compute@1.9.0

## 1.8.0

### Minor Changes

- a6471f2: K6 — `0g mcp init <agent>` wires 0gkit into Cursor / Claude / Windsurf / Codex in one command.
  - **`0gkit-cli`**: new `0g mcp init <agent> [--global]` writes the editor's MCP config. By default it points at the neutral `npx @foundryprotocol/0gkit-mcp` server (nine `og_*` tools); inside a kitted `mcp-agent` project it points at the local project server so the kit's own MCP tools appear too. Lazy-imports `0gkit-mcp` (cold-start unchanged).
  - **`0gkit-mcp`**: `create0gMcpServer({ plugins })` generalizes the plugin seam; new `collectToolPlugin()` adapts a `register(server, opts)` tool module into a plugin; new `buildMcpConfig()` / `readAppliedKits()` config writer. Each `mcp-agent` kit adapter now also exports an `mcpToolPlugin` factory.
  - **`0gkit-kits`**: `applyKit` on the `mcp-agent` base generates a `src/kits.ts` aggregator that wires every applied kit's `mcpToolPlugin` into the local server. **Bugfix:** `applyKit` now copies `adapters/<base>/…` and `ui/…` tier files from their real (tier-prefixed) location in the fetched overlay to their flat project destination — previously it looked for them at the destination path and `0g add <kit>` would `ENOENT` on adapter/UI tiers against the published overlay (a latent K0-era bug that the test fake-overlay had masked; the K6 synergy depends on the adapter file actually landing).

  The neutral server never imports a kit overlay — kit tools run in your own scaffolded project. No new env vars.

## 1.5.0

### Patch Changes

- Updated dependencies [006e514]
- Updated dependencies [f59b752]
  - @foundryprotocol/0gkit-core@1.5.0
  - @foundryprotocol/0gkit-attestation@1.5.0
  - @foundryprotocol/0gkit-chain@1.5.0
  - @foundryprotocol/0gkit-compute@1.5.0
  - @foundryprotocol/0gkit-da@1.5.0
  - @foundryprotocol/0gkit-storage@1.5.0

## 1.3.0

### Patch Changes

- Updated dependencies [c205c36]
  - @foundryprotocol/0gkit-core@1.3.0
  - @foundryprotocol/0gkit-attestation@1.3.0
  - @foundryprotocol/0gkit-chain@1.3.0
  - @foundryprotocol/0gkit-compute@1.3.0
  - @foundryprotocol/0gkit-da@1.3.0
  - @foundryprotocol/0gkit-storage@1.3.0

## 1.2.1

### Patch Changes

- Updated dependencies [d964721]
  - @foundryprotocol/0gkit-storage@1.2.1
  - @foundryprotocol/0gkit-compute@1.2.1

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
  - @foundryprotocol/0gkit-core@1.0.1
  - @foundryprotocol/0gkit-da@1.0.1
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
  - @foundryprotocol/0gkit-core@1.0.0
  - @foundryprotocol/0gkit-da@1.0.0
  - @foundryprotocol/0gkit-storage@1.0.0

## 0.4.0

### Patch Changes

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

- Updated dependencies [eca1540]
  - @foundryprotocol/0gkit-core@0.4.0
  - @foundryprotocol/0gkit-storage@0.4.0
  - @foundryprotocol/0gkit-compute@0.4.0
  - @foundryprotocol/0gkit-da@0.4.0
  - @foundryprotocol/0gkit-attestation@0.4.0
  - @foundryprotocol/0gkit-chain@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [c4fc6fe]
- Updated dependencies [c834d6a]
  - @foundryprotocol/0gkit-storage@0.3.0
  - @foundryprotocol/0gkit-compute@0.3.0
  - @foundryprotocol/0gkit-da@0.3.0
  - @foundryprotocol/0gkit-attestation@0.3.0
  - @foundryprotocol/0gkit-core@0.3.0
  - @foundryprotocol/0gkit-chain@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [63a297e]
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
