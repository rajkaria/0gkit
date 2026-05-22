# 0gkit Decision Log

> Append-only. Every architectural decision that survived a debate gets one entry.
> Format: `Dn` (stable id) — short title — date — why.

---

## D1 — npm scope is `@foundryprotocol/0gkit-*`

**Date:** 2026-05-17 · **SP:** pre-roadmap

Probed free; fallbacks `@zerogkit/*` or `zerog-*` if scope is ever lost. Code stays protocol-neutral; the scope is just the publishing org. CLI binary is `0g`.

---

## D2 — Workspace tooling

**Date:** 2026-05-17 · **SP:** pre-roadmap

- `pnpm@9.12.0` via corepack · `node >=20.10` (CI uses 22) · `turbo` for orchestration · `tsup` for ESM builds · `vitest` for tests · `changesets` for releases · `dependency-cruiser` for boundary checks.

---

## D3 — Protocol neutrality is a hard CI gate

**Date:** 2026-05-17 · **SP:** pre-roadmap

No `@foundryprotocol/0gkit-*` package may statically import any other `@foundryprotocol/*` package. Enforced by `pnpm boundary:check` + a `boundary.test.ts` in surface packages. The CLI's Foundry-plugin loader uses a computed specifier (`["@foundryprotocol","sdk"].join("/")`) so dependency-cruiser sees no edge.

---

## D4 — CLI: `commander ^14`, no `chalk` (internal ANSI), `.exitOverride()` before subcommand registration

**Date:** 2026-05-18 · **SP:** SP3 (original)

`commander` gives us typed nested subcommands + a clean test seam. `chalk@5` is ESM-only and forced peer-resolution headaches in tsup → we ship a 15-line internal ANSI helper instead. `commander@14` copies `_exitCallback` at subcommand-creation, so the override MUST be called on the root program before children are added, and `cli.ts` catches `CommanderError` → `process.exit(code)` so `--help`/`--version`/errors exit cleanly.

---

## D5 — Initializer was planned as `create-0g-app`, superseded by D12

**Date:** 2026-05-20 · **SP:** SP1

`npm create 0g-app` (which resolves to a package named `create-0g-app`) wins muscle memory for `npm create <thing>`. `create-0gkit-app` is the defensive registration but is **not** the primary entry. We register both names on npm; the `create-0gkit-app` package is a 3-line shim that prints `→ use 'npm create 0g-app' instead` and exits 1.

Superseded on 2026-05-21: npm publish returned 403 for `create-0g-app`
because the root package name is held by another publisher. See D12.

---

## D6 — `0g dev` storage mock CAS is filesystem-backed, not sqlite

**Date:** 2026-05-20 · **SP:** SP2

Files live at `.0g-dev/storage/<merkle-root>` (binary blob, optionally + a `.meta.json` sibling). Filesystem is simpler, more portable, and lets developers `cat`/`ls` their dev state directly. Sqlite would couple storage to a DB schema we don't need; if performance ever bites, we add a sqlite index layer on top, not a rewrite.

---

## D7 — `0gkit-wallet` is RSC-first (Next.js 16 default)

**Date:** 2026-05-20 · **SP:** SP3

Browser providers (`ZeroGWalletProvider`, `useWallet`, …) are client-only via `"use client"`. Server primitives (`fromEnv`, `fromKMS`, `siwe.verify`) are pure Node, no client deps. The two halves live in separate sub-paths (`@foundryprotocol/0gkit-wallet` for Node + `@foundryprotocol/0gkit-wallet-react` for browser) so tree-shaking is automatic and "no RSC support" is impossible by construction. Documented Pages-Router fallback in docs, not in code.

---

## D8 — `0gkit-jobs` default backend is `memory`; `sqlite` is the documented prod choice

**Date:** 2026-05-20 · **SP:** SP10

`memory` is the right default because `0g dev` runs single-process and tests want zero setup. `sqlite` (via `better-sqlite3`) is the documented "I have one production node and don't want to run Redis" choice. `redis` is the multi-node prod option. Three backends, all conforming to the same interface.

---

## D9 — Error codes are flat `SCREAMING_SNAKE`, namespaced by prefix

**Date:** 2026-05-20 · **SP:** SP9

Codes look like `STORAGE_QUOTA_EXCEEDED`, `COMPUTE_PROVIDER_UNREACHABLE`, `DA_VERIFY_FAILED`, `ATTESTATION_BAD_SIGNATURE`. Flat is easier to grep, easier to URL (`0gkit.dev/errors/STORAGE_QUOTA_EXCEEDED`), and easier to type. Renaming a code is a semver-major change. Adding a code is minor.

---

## D10 — No mainnet timing dependency

**Date:** 2026-05-20 · **SP:** roadmap-wide

Every sub-project in the essentials roadmap (SP1–SP12) works against Galileo today and will work against mainnet day one — the only thing that changes is a network preset. Mainnet launch triggers a marketing pass (release notes, blog, `1.0.0` cut), not a re-plan.

---

## D11 — `Signer` interface lives in `0gkit-core`, not `0gkit-wallet`

**Date:** 2026-05-21 · **SP:** SP3

Layer-1 primitives (`0gkit-storage`/`0gkit-compute`/`0gkit-da`/`0gkit-attestation`/`0gkit-chain`)
need to consume a `Signer` type. If that type lived in `0gkit-wallet`, every
primitive would have to peerDepend on the wallet package — creating a
fan-out the dep-cruiser rule can flag as suspicious AND a real install-time
weight problem (KMS, wagmi, etc. would tunnel into every storage user). By
defining the interface in `0gkit-core` (the package every other 0gkit-\* already
depends on), primitives consume only a type and stay weightless. Wallet
implements; primitives consume; no cycle, no extra installs.

---

## D12 — Canonical initializer is `create-0gkit-app`

**Date:** 2026-05-21 · **SP:** Phase 1 release fix

The public front door is `npm create 0gkit-app@latest`. The originally planned
`create-0g-app` package is private because the npm root name is held by another
publisher. To avoid duplicate scaffolder code, `create-0gkit-app` bundles the
same source implementation at build time, has its own `create-0gkit-app` binary,
and publishes as the only working npm-create package. Documentation, CI smoke
tests, and template fetches use the GitHub repo slug `rajkaria/0gkit`
(see D13 for the rename history).

---

## D13 — GitHub repo renamed `0G-ai-kit` → `0gkit`

**Date:** 2026-05-21 · **SP:** SP4 housekeeping

The repository was renamed from `rajkaria/0G-ai-kit` to `rajkaria/0gkit` to
match the npm publishing scope (`@foundryprotocol/0gkit-*`), the canonical
initializer (`create-0gkit-app`), the public command (`npm create 0gkit-app`),
and the brand. The previous name carried a misleading "ai" suffix even though
the toolkit covers storage, compute, DA, attestation, chain, contracts, and
indexing — not just inference. GitHub maintains an HTTP redirect from the old
name; existing clones continue to work but should `git remote set-url origin
https://github.com/rajkaria/0gkit.git`. All in-repo URL references
(package.json `homepage`/`repository`/`bugs`, README CI badge, SECURITY.md,
template degit commands, and the `TEMPLATE_REPO` constant in
`create-0g-app/src/templates.ts`) were rewritten to the new slug in the same
PR.

---

## D14 — Typed contracts use wagmi-style `.read.method()` / `.write.method()` API

**Date:** 2026-05-21 · **SP:** SP4

`viem.getContract` already exposes typed `.read.balanceOf(args)` and
`.write.transfer(args)` accessors when given an `as const` ABI literal. We
surface this directly rather than wrapping it in a custom `.call('name', args)`
adapter. Reasons: (a) IntelliSense works out of the box on codegen'd contracts;
(b) the API is industry-standard via wagmi so newcomers already know it;
(c) zero adapter code to maintain. We layer one thin behaviour on top: every
`write.*` call auto-awaits the receipt and returns the `0gkit-core.Receipt`
shape, so users don't have to remember the viem two-step.

---

## D15 — Codegen consumes Foundry artifacts (not Hardhat) as v0

**Date:** 2026-05-21 · **SP:** SP4

`forge build` is the recommended toolchain for 0G contracts (the
`contracts/` directory in `foundry/Foundryprotocol` ships a `foundry.toml`,
not a `hardhat.config.ts`). Foundry's artifact format is simple JSON with
`{ abi, contractName }` at the top level. Hardhat support adds variance
(file paths differ, the artifact wraps `abi` inside an `output` object) — we'll
add a Hardhat parser as a plugin in a follow-up, not v0. Users on Hardhat
today can extract the abi with `jq` before invoking `0g contracts generate`.

---

## D16 — Codegen emits TS via template strings, not `ts-morph`

**Date:** 2026-05-21 · **SP:** SP4

`ts-morph` is ~6 MB and ships its own TypeScript compiler — adding that for
the ~80 lines we actually need (`const out = \`...\` + JSON.stringify(abi)`)
is a poor trade. Template strings are also byte-deterministic
(snapshot-testable) and editable. If we ever need AST-level rewriting (rare),
we'll add `ts-morph` then.

---

## D17 — `testWallet` re-uses anvil's dev mnemonic

**Date:** 2026-05-21 · **SP:** SP5

`testWallet({ index: 0 })` produces a Signer derived from the same
`"test test test test test test test test test test test junk"` mnemonic that
`0g dev`'s anvil pre-funds. So a test that hits the local devnet with
`testWallet({ index: 0 })` immediately has gas, no faucet round-trip required.
The mnemonic is the universal "anvil dev seed" — every Ethereum developer
recognizes it.

---

## D18 — Matchers live under `/matchers` sub-path and self-register on import

**Date:** 2026-05-21 · **SP:** SP5

`import "@foundryprotocol/0gkit-testing/matchers"` is a side-effect import —
each matcher file calls `expect.extend(...)` at top level. The sub-path means
users who don't need matchers (or only want the mocks / fixtures) don't pay
the dependency cost. Mirrors how `chai-as-promised` and
`@testing-library/jest-dom` work — the pattern is industry-standard.

The matcher for `toBeValidAttestation` lazy-imports
`@foundryprotocol/0gkit-attestation` via a computed-specifier dynamic import
(`["@foundryprotocol", "0gkit-attestation"].join("/")`), matching the
foundry-plugin loader pattern from D4. This keeps the testing package free of
a static dep on attestation — important because the migrated test in
`0gkit-attestation` depends on `0gkit-testing`, so a static edge in either
direction would create a build cycle.

---

## D19 — `0gkit-indexer` cursor backends: sqlite direct dep, redis optional peer

**Date:** 2026-05-22 · **SP:** SP6

`better-sqlite3` is a direct dependency: it ships with the package, ~2 MB
install, synchronous (no event-loop hop per cursor write), and gives every user
persistent cursors out of the box without an extra install step. `ioredis` is
an `optionalPeerDependency`: redis is a multi-process / clustered deployment
concern, and forcing every user to install it would balloon the install
footprint for the common (single-process) case. Sub-path exports
(`/cursors/sqlite`, `/cursors/redis`) let tree-shaking strip the unused backend
from production bundles.

---

## D20 — `0gkit-indexer` uses polling, not WebSocket subscriptions

**Date:** 2026-05-22 · **SP:** SP6

EVM RPC WebSocket subscriptions are notoriously unreliable (silently drop, miss
reconnects, inconsistent across providers). Polling with `getLogs` works against
every RPC, is restartable across process crashes via the persisted cursor, and
gives us a uniform place to insert reorg detection. The 2-second default poll
interval is plenty for the dapp use cases this indexer targets (event-driven
UIs, side-effect reactors). Sub-second latency users can override
`pollIntervalMs`.

---

## D21 — Compute token-count heuristic: `chars / 4` (ceil)

**Date:** 2026-05-22 · **SP:** SP7

OpenAI's documented English approximation: 1 token ≈ 4 characters. We adopt
this in `countTokens(text)` so cost estimates round-trip in pure JS with no
tokenizer download. Estimates are explicitly order-of-magnitude — D22 documents
the per-token fee placeholder. A precise tokenizer (`tiktoken` ≈ 6 MB of vocab
files) would inflate every install for sub-cent precision nobody asked for.

---

## D22 — Storage segment math: ceil(bytes / 256 KiB)

**Date:** 2026-05-22 · **SP:** SP7

0G storage chunks files into 256 KiB segments (matches `@0gfoundation/0g-storage-ts-sdk`
default). `estimateBytes(n)` returns `{ sizeBytes, segments: ceil(n / 256 KiB) }`.
Per-segment gas/fee defaults (`80_000 gas`, `1 gwei`) are heuristics matching
observed Galileo behaviour mid-2026. The SDK's actual cost function will
override these once a programmatic feed exists.

---

## D23 — `DryRunResult<T>` envelope

**Date:** 2026-05-22 · **SP:** SP7

Every write path that accepts `{ dryRun: true }` returns:

```ts
{ dryRun: true, estimate: Estimate, result: T }
```

— where `T` is the existing success shape with `txHash`/`blockNumber` left
undefined. This keeps callers' type narrowing simple (`if (res.dryRun) {...}`)
and means dry-run code paths share the same Receipt-handling logic as live ones.
The DA `DEFAULT_DA_RATE_WEI_PER_BYTE = 1e6 wei/byte` is a placeholder until 0G
publishes a programmatic DA pricing feed.

---

## D24 — Templates live under `templates/<name>/` with one folder per archetype

**Date:** 2026-05-22 · **SP:** SP8

Five SP8 archetypes (`chat`, `storage-app` refresh, `ai-agent`,
`tee-attested-api`, `nft-with-storage`) added alongside the four Phase-1
templates. `create-0gkit-app` resolves them via `giget` from
`rajkaria/0gkit/templates/<name>#<TEMPLATE_REF>`. Default ref bumped to
`v0.3.x` for the SP8 release.

Templates are **not** in `pnpm-workspace.yaml` (they vendored stale 0gkit
deps that wouldn't reinstall against current registry state, and they are
explicitly meant to be installed as standalone projects by `create-0gkit-app`
consumers — every CI invocation reuses the same `npm install --no-package-lock`
path the user will hit). Per-template vitest runs are driven by the
template's own `package.json` after a local install.

---

## D25 — Each template's testable surface lives in a separate `<flow>.ts`, not the entry

**Date:** 2026-05-22 · **SP:** SP8

`templates/storage-app/src/storage-flow.ts`,
`templates/chat/lib/message.ts`,
`templates/ai-agent/src/agent.ts`,
`templates/tee-attested-api/src/app.ts`,
`templates/nft-with-storage/src/mint-flow.ts`.

The `src/index.ts` (or `app/page.tsx`) is the *thin entry* that wires real
dependencies. The flow file accepts a `deps` bag so tests can inject inline
fakes that match the published `0gkit-*` API surface — bypassing the
`0gkit-testing` mocks whose shape currently lags the real Storage/Compute
classes (the mocks predate SP7 dry-run and SP6 InferenceResult). Entry files
are excluded from coverage thresholds because they're configuration glue.

---

## D26 — SP10/SP11 hand-off paths documented inline in `ai-agent` and `tee-attested-api`

**Date:** 2026-05-22 · **SP:** SP8

`ai-agent` runs the agent loop in-process today; the README documents where
`@foundryprotocol/0gkit-jobs` (SP10) will swap in once it ships (per-step
`compute.inference` becomes `jobs.enqueue("step", ...)`). `tee-attested-api`
uses `console.log` for access logging today and a fixture attestation source
(wrapping `0gkit-testing/fixtures.fixtureAttestation`); the README documents
the `@foundryprotocol/0gkit-observability` (SP11) swap (one-line replacement
for the `log` dep) and where to plug a real provider attestation feed.

**Why:** Honesty rule. Roadmap §SP8 listed SP10/SP11 as dependencies; we
don't ship templates that import packages that don't exist, but we also
don't ship templates that pretend the future doesn't exist. Inline TODOs
+ a deps-injection seam make the migration mechanical when SP10/SP11 land.
