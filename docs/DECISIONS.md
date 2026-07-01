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

The `src/index.ts` (or `app/page.tsx`) is the _thin entry_ that wires real
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

- a deps-injection seam make the migration mechanical when SP10/SP11 land.

---

## D27 — `helpUrl` is computed from the code, not stored per-throw

**Date:** 2026-05-22 · **SP:** SP9

`ZeroGError.helpUrl = `${ERROR_HELP_BASE}${code}``(default`https://0gkit.dev/errors/<CODE>`). We don't store the URL on each throw site
for two reasons: (a) DRY — one source of truth for the URL shape; (b) it lets
us rebase the docs domain (e.g. to `docs.0gkit.dev`) with a single
`ERROR_HELP_BASE`swap and a release. If per-code URL overrides ever become
necessary (unlikely — every code corresponds to one MDX page), the lookup
moves into`helpUrlFor()` and the callers don't change.

**Why:** Honesty rule extended to docs. Every error references its own fix
page — no error is more findable than another, and the URL can never drift
out of sync with the code (they share a deterministic mapping).

---

## D28 — `pnpm docs:check` is a CI gate, not just a lint

**Date:** 2026-05-22 · **SP:** SP9

Every `ErrorCode` referenced by a `throw new ZeroGError(...)` (or by a subclass
with an explicit code arg) MUST have a corresponding directory under
`apps/docs/app/errors/<CODE>/page.mdx`. The check runs in CI after `pnpm test`.
A PR that adds a code without adding a page fails red; deleting a code without
deleting its page also fails red (catches doc-rot from refactors).

Codes in the enum that aren't yet thrown anywhere are a **warning only**, not
a failure — the enum forward-defines SP10 (`JOBS_*`) and SP11
(`OBSERVABILITY_*`) codes so later sprints don't have to amend the enum
mid-roadmap.

Static regex extraction is fine — codegen-grade precision would be overkill,
false positives are rare, and the failure mode is a noisy CI run not a runtime
bug.

**Why:** The whole point of SP9's `helpUrl` story falls apart if the URL points
at a 404. CI is the only place the invariant can be guaranteed; humans forget,
linters get bypassed.

---

## D29 — `0gkit-jobs` backends mirror the SP6 indexer pattern

**Date:** 2026-05-22 · **SP:** SP10

Three backends — `memory` (in-process, dev/test), `sqlite` (single-node prod,
`better-sqlite3` direct dep), `redis` (multi-node prod, `ioredis` optional
peer loaded via computed-specifier `["ioredis"].join("/")` to keep the dep
graph strict). Sub-path exports (`./backends/memory`, `./backends/sqlite`,
`./backends/redis`) let tree-shaking strip unused backends. This is the same
shape as the indexer's cursor backends (D19) — one pattern, two packages.

A single `JobBackend` interface + a `describe.each`-parameterised conformance
test suite means every backend exercises the same eight scenarios (enqueue
ordering, claim FIFO, complete, fail-with-retry, fail-without-retry, cancel,
status-of-unknown, terminal-state cancel no-op) plus the JOBS_JOB_NOT_FOUND
error path. Adding a fourth backend (postgres, dynamodb, …) is a single new
factory in the test file.

**Why:** Two packages with the same shape is the right kind of duplication —
discoverable, predictable, and reviewable. Diverging the pattern would force
every reader to learn it twice; converging it (a shared abstract base) would
buy nothing while creating a cross-package change-coupling cost.

---

## D30 — Webhook signature is HMAC-SHA256, hex, `sha256=` prefix tolerated

**Date:** 2026-05-22 · **SP:** SP10

The `X-0gkit-Signature` header carries `sha256=<64-hex>` (GitHub webhook
convention). `verifyWebhook` accepts both the prefixed and bare hex forms for
ergonomics. Verification uses `timingSafeEqual` to defeat timing attacks; the
returned boolean never throws on garbage input (avoids leaking parser
behaviour). The signed payload is the **exact** request body bytes, NOT a
re-serialised JSON, so consumers must read raw bytes (`express.text({ type:
"*/*" })` / `next.js req.text()`) before verifying.

The webhook fire is best-effort: retries default to 2 (3 attempts total) with
linear backoff. Webhook failures do **not** affect job state — the job is
already `done` or `failed` by the time the runner attempts delivery.

**Why:** GitHub's pattern is the most-recognised webhook shape in 2026. Bare
hex tolerance is for receivers behind proxies that strip the prefix. Timing
attacks on signature comparison are real and free to defend against.

---

## D31 — At-least-once delivery; handlers MUST be idempotent

**Date:** 2026-05-22 · **SP:** SP10

A worker that crashes between `handler` completion and `backend.complete()`
returning will retry on next claim. Therefore handlers must be idempotent on
their inputs (use `jobId` as the idempotency key for any external side
effect). The webhook fires after `complete()` so duplicate webhook delivery
is also possible — the receiver should dedupe on `(jobId, newState)`.

The other delivery semantics on the table were rejected:

- **Exactly-once:** impossible without a distributed transaction across the
  backend AND every external side-effect endpoint. We're not building that.
- **At-most-once:** trivially achievable (don't retry on `fail()`) but
  surrenders the whole point of a job runner — surviving transient
  upstream failures.

The trade is paid by the handler author, not the platform. Documented in
the durable-jobs concept page so users meet the constraint before they
write side-effects.

**Why:** Every durable job runner that's honest about its delivery semantics
lands here (Sidekiq, BullMQ, Temporal in some modes, AWS SQS). The honesty
matters: silent at-most-once is the failure mode that wakes engineers up.

---

## D32 — Observability via prototype patching, not module rewriting

**Date:** 2026-05-22 · **SP:** SP11

`instrument0g()` mutates `Storage.prototype.upload` etc. directly at call
time. Because ES modules export live bindings, this takes effect for every
caller that already imported the class. This avoids the alternative — a
`tracedStorage(s)` wrapper users would have to remember to call everywhere —
and matches the OTel auto-instrumentation contract that "one call wires
everything."

Tests use `mode: "attach"` + an explicit `targets` injection so the
synchronous path is exercised without dynamic imports.

**Attestation is intentionally excluded from `defaultTargets()`.**
`@foundryprotocol/0gkit-attestation` ships free functions (`verifyEnvelope`,
`signEnvelope`, …) — not a class with a prototype to patch. Module-export
monkey-patching is fragile under ESM live bindings (consumers may have
already captured a reference to the function), so we don't auto-wrap it. If
a future `AttestationClient` class ships, callers can pass it via
`instrument0g({ targets: { attestation: { class, methods } } })` with no
code changes needed in `0gkit-observability` (the `ATTESTATION_MAPPERS` map
is already there).

**Why:** "One call wires everything" beats "two-API split where one half is
silently optional." The cost is a small dynamic import on the auto path,
which we already eat to keep the boundary check clean.

---

## D33 — Span attribute namespace is `0gkit.*`, frozen const in `ATTR`

**Date:** 2026-05-22 · **SP:** SP11

All attribute keys live in a single `ATTR` constant in `attributes.ts`. The
canonical names: `0gkit.network`, `0gkit.op`, `0gkit.size_bytes`,
`0gkit.segments`, `0gkit.gas_native`, `0gkit.fee_native`,
`0gkit.confirm_seconds`, `0gkit.root`, `0gkit.tx_hash`, `0gkit.block_number`,
`0gkit.model`, `0gkit.input_tokens`, `0gkit.output_tokens`,
`0gkit.error_code`, `0gkit.dry_run`. Standard OTel `http.*` / `rpc.*`
attributes are layered on top by user instrumentation — we don't duplicate
them.

The `0gkit.*` prefix follows OTel's vendor namespace convention so
collectors and cost calculators can filter on the prefix with a single
predicate. The `ATTR` const is `Object.freeze`'d so consumers can rely on
the key set never silently widening at runtime.

**Why:** A single source of truth prevents the typical "we typed
`0gkit.fee` here and `0gkit.fee_wei` over there" drift that ruins
collector dashboards six months later.

---

## D34 — Bundle budget 20 KB gzipped for the public entry

**Date:** 2026-05-22 · **SP:** SP11

Asserted by `bundle-size.test.ts` via esbuild + gzip. `@opentelemetry/api`
is externalised (it's a peer; users provide it). The SDK and exporter peers
(`@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`) are
optional and lazy-imported — they never reach the bundle unless the caller
explicitly chooses the auto-SDK path AND emits at least one span.

Measured today: **~2.2 KB gzipped** (well under the 20 KB ceiling). The
budget protects the "free observability" promise — we never want users to
weigh a toolkit decision on observability bundle cost.

**Why:** A budget that the test asserts is the only kind of budget that
holds. Once someone slips in a static dep that drags 50 KB of transitive
JSON-Schema validation in, gzip jumps and the test fails red — exactly the
moment we'd want to know.

---

## D35 — CI/CD workflows are scaffolded files, not opinionated defaults

**Date:** 2026-05-22 · **SP:** SP12

`create-0gkit-app --ci github` copies `templates/_ci/github/0gkit-ci.yml`
verbatim into the new project. The file is intentionally minimal — five
steps (checkout, pnpm setup, node setup, install, typecheck+test) — so
users own it from day one. We don't ship a "0gkit-ci" GitHub Action that
hides build behind opaque inputs because that creates a black box users
distrust the moment something breaks.

GitLab + CircleCI variants follow the same shape with their native syntax.
The `none` choice scaffolds nothing and is the explicit opt-out.

**Why:** Bundling a managed CI action would force every contributor onto a
release cadence for their CI changes — fine for end users today, painful at
the first incident. A copy-paste-able YAML keeps the toolkit's surface
small and the user's autonomy total.

**How to apply:** Future CI templates (Bitbucket, Jenkins) follow the same
"minimal copy" model. No `uses: @foundryprotocol/0gkit/ci-action@v1` —
ever.

---

## D36 — In-site search via Pagefind, not Algolia DocSearch

**Date:** 2026-05-22 · **SP:** SP12

Pagefind builds the index at static-export time, ships the search runtime
as a ~5 KB JS widget, works fully offline / on preview deploys, and has no
external service to provision or monthly cost. Algolia DocSearch would be
the obvious alternative for fuzzy multilingual search, but we don't need
that — we need "find the error code page" and "find the package API page,"
and Pagefind nails both.

**Why:** Every external dep on a docs surface is a runtime liability —
DocSearch outages have visibly broken docs sites we've consumed. Pagefind
runs in the user's browser against a static asset; if the docs deploy is
up, search is up.

**How to apply:** If a multilingual story ever ships, revisit. Until then,
all new docs pages just need to be plain MDX — Pagefind indexes them
automatically.

---

## D37 — Lighthouse CI gate: 0.95 across performance/a11y/best-practices/SEO

**Date:** 2026-05-22 · **SP:** SP12

`@lhci/cli` runs against the production-built docs site on every PR. Gate
is `["error", { "minScore": 0.95 }]` across the four Lighthouse categories.
0.95 is the floor that catches real regressions (un-optimised images,
missing alt text, CLS spikes) without becoming a tax that blocks
legitimate changes.

**Why:** A 0.99 floor is brittle (Lighthouse runs vary ±2 points
session-to-session); a 0.90 floor is noise (most regressions hide in the
0.90-0.95 band). 0.95 is where Lighthouse's own categories cross from
"good" into "great" — the right place to draw a line that means something.

**How to apply:** When the score drops, the right move is fix the root
cause, not lower the gate. The score isn't a brag — it's the floor below
which builders' trust drops.

---

## D38 — `ERROR_HELP_BASE` locked to `https://0gkit.com/errors/` from v1.0.1

**Date:** 2026-05-23 · **SP:** SP13 (landing + helpUrl)

`0gkit.com` is the canonical landing + docs + playground deployment.
From v1.0.1 onward, every `ZeroGError.helpUrl` resolves against
`https://0gkit.com/errors/<CODE>` — derived from this single constant,
never hard-coded at the throw site (per D27).

**Why:** D27 set the helpUrl up to be rebaseable by changing one
constant. Locking it to the canonical domain at the first v1.0.x patch
stabilises the URL pattern early in the v1 series, before there's any
meaningful install base on a divergent base.

**How to apply:** Never hard-code `helpUrl` at a `throw` site. Always
derive via `helpUrlFor(code)`. If the domain ever needs to move, edit
this one constant and ship a patch.

---

## D77 — Kits are git overlays applied via giget, not published packages or codegen

**Date:** 2026-06-30 · **SP:** K0

Kits live as source trees under `templates/_kits/<kit-name>/` (lib, adapters, ui tiers) and are applied by copying those files into an existing project — exactly what `giget`'s `downloadTemplate` does when pointed at a local or remote git path (reusing the `fetchCi` pattern from the CI templates feature). They are not published as npm packages, and they do not generate code from strings at apply-time.

**Why:** Published packages would require a `@foundryprotocol/kit-*` publish cycle for every kit change and would pollute the user's `node_modules` with kit source. String codegen makes diffs unreadable and breaks editor tooling until the first build. Git overlays are auditable (users can diff before/after), composable (tier selection at apply-time), and idempotent (re-applying only rewrites changed files). The giget download path is already battle-tested for the CI template feature and handles both local monorepo and remote git sources.

**How to apply:** Every new kit is a directory under `templates/_kits/` containing a `kit.json` manifest and tier subdirectories. `applyKit` calls `fetchKitOverlay` (giget) → `resolveTiers` → file merge. Never publish kit overlay files as a standalone npm package or generate kit files from template strings.

---

## D78 — The kits engine imports only `zod` + `giget` + `node:*`; kit overlays may import `0gkit-*`

**Date:** 2026-06-30 · **SP:** K0

The engine package (`packages/0gkit-kits/src`) must never import any `@foundryprotocol/*` package — neither toolkit packages (`0gkit-*`) nor Foundry app packages. Its only external deps are `zod` (manifest validation) and `giget` (overlay fetch). This is enforced by the `no-kits-engine-to-0gkit` boundary rule.

Kit _overlays_ (`templates/_kits/`) are consumer code that will be applied into a user's project. They may import `@foundryprotocol/0gkit-*` toolkit packages (e.g. `0gkit-storage`, `0gkit-core`). They must never import non-0gkit `@foundryprotocol/*` packages (e.g. `@foundryprotocol/sdk`). Enforced by the `no-kit-overlay-to-foundry-app` boundary rule.

**Why:** The engine is loaded by the CLI. Keeping it pure of `0gkit-*` deps prevents any transitive pull of heavy toolkit packages (ethers, OTel, SQLite) into the CLI cold-start path. Keeping kit overlays free of Foundry app packages maintains the 0gkit neutrality invariant (D3) in user projects.

**How to apply:** When adding logic to the kits engine, reach for `zod`/`giget`/`node:*` only. If you need a 0gkit primitive in the engine (e.g. to resolve a network name), expose a callback parameter and let the CLI pass it in rather than importing `0gkit-core` directly. `pnpm boundary:check` enforces both rules on every CI run.

---

## D79 — 3-tier kit model: lib always, adapters[base] if present, ui on React bases only

**Date:** 2026-06-30 · **SP:** K0

Each kit overlay is organized into three tiers: `lib/` (framework-agnostic business logic, always applied), `adapters/<base>/` (base-specific wiring, applied only when the target project's base matches), and `ui/` (React components, applied only when the base is React-capable per `isReactBase`). A kit is offered for a given base if and only if `resolveTiers(kit, base)` returns a non-empty tier list — i.e., at least one tier has files for that base.

**Why:** A single-tier "dump everything" overlay would either break non-React projects (by injecting JSX) or leave React projects without the hook layer. Three tiers let a single kit manifest serve every base archetype without conditional codegen or a proliferation of per-base kit packages.

**How to apply:** When authoring a new kit, put all framework-agnostic logic in `lib/`, base-specific wiring in `adapters/<base-name>/` (one directory per base archetype the kit supports), and React UI primitives in `ui/`. Do not add React-only files to `lib/` or `adapters/`. `kits:check` validates that every tier directory referenced in the manifest exists and contains at least one file.

---

## D80 — Kit composition: `composes[]` auto-applies deps first; `conflicts[]` throws; deps travel in `dependencies`

**Date:** 2026-06-30 · **SP:** K0

A kit's `kit.json` may declare `composes: ["other-kit"]` to auto-apply dependency kits before itself (deps-first ordering, deduped by name, cycle-detected). It may also declare `conflicts: ["incompatible-kit"]` to throw a `KitError` if that kit is already applied. Required 0gkit packages travel in the kit's `dependencies` field (not the manifest's `requires` field), so the overlay's package.json is self-sufficient when merged into the target project — the user never has to manually install packages that the kit needs.

**Why:** Without `composes`, a user applying `agent-memory-with-ui` would have to know to also apply `agent-memory` first — leaking implementation details. Without dedup, applying two kits that both compose a shared base kit would double-apply files. `KitError` on conflict prevents silent breakage when two kits patch the same files incompatibly. Putting 0gkit deps in `dependencies` (not `requires`) means the overlay is always self-sufficient: a future kit author won't have to separately document "also run `npm install @foundryprotocol/0gkit-storage`" — the `mergePackageJson` step handles it.

**How to apply:** In `kit.json`, use `composes` for "apply these kits first" and `conflicts` for "fail loudly if this kit is already applied." Put `@foundryprotocol/0gkit-*` package version pins in `dependencies` (not `requires`) so `mergePackageJson` injects them automatically. `requires` is reserved for non-0gkit peer checks (e.g. "the project must already have `react` as a dep").

---

## D81 — K1 attestation = honest signed inference receipt; no TEE-quote verification

**Date:** 2026-06-30 · **SP:** K1

`0gkit-attestation` provides EIP-191 signed-envelope verification over an eval-result schema — not TEE quote verification. K1's `ai-oracle` and `sealed-inference` kits frame this honestly: the attestation badge reads "✓ signature verified", never "TEE attested". The `Attestor` interface is injected (not hard-coded) so a real TEE-quote verifier can slot in later without changing consumer code.

**Why:** The stack has no TEE quote verification. Labelling an EIP-191 signature check as "TEE attestation" would be fabricated behavior — a direct violation of the honesty rule. The `Attestor` seam preserves the upgrade path while keeping current claims accurate.

**How to apply:** Never display "TEE attested" or "hardware-verified" unless a real quote verifier is wired in. The badge text must be "✓ signature verified". When adding a new attestation path, implement the `Attestor` interface and inject it — do not hard-code a verifier strategy.

---

## D82 — K1 anchor = 0G Storage by default; opt-in on-chain via `Anchor.sol`

**Date:** 2026-06-30 · **SP:** K1

K1 ships two anchor strategies. The default is **0G Storage anchor**: the inference result is uploaded to 0G Storage and the content-addressed `root` hash is the commitment. The opt-in is **on-chain anchor**: a bundled `Anchor.sol` contract (via `0gkit-contracts.createTypedContract`) records the root on-chain, enabled by the env flag `OG_ANCHOR_ONCHAIN=1`.

**Why:** No `chain.anchor` primitive exists in the stack. Rather than fabricating one, K1 uses what is real: 0G Storage's content-addressed root is already a cryptographic commitment. The on-chain anchor is additive and opt-in — it does not block users on chains without a deployed contract.

**How to apply:** Default to the 0G Storage anchor. Gate on-chain anchoring behind `OG_ANCHOR_ONCHAIN=1`. When deploying `Anchor.sol`, pass the address via `ANCHOR_CONTRACT_ADDRESS`. Mirror the `templates/nft-with-storage` pattern for contract wiring.

---

## D83 — `gen-registry.mjs` prettier-formats its generated output

**Date:** 2026-06-30 · **SP:** K0 (codegen hygiene fix, landed with K1 reconciliation)

`packages/0gkit-kits/scripts/gen-registry.mjs` now pipes its generated `registry.generated.ts` through prettier before writing. Previously the script emitted raw `JSON.stringify` output that never matched prettier's style — every CI run produced a `format:check` diff on the generated file.

**Why:** A generated file that perpetually drifts from the formatter is worse than no formatter gate: it trains contributors to ignore `format:check` failures. Formatting at codegen time makes the output idempotent with respect to the formatter and eliminates the drift permanently.

**How to apply:** Any codegen script that emits TypeScript or JSON must pass its output through `prettier.format()` (with the project's config) before writing the file. Add a graceful cold-build fallback (write raw output if prettier is not yet installed) so the script is safe to run before `pnpm install`.

---

## D84 — `0g test` lazy-imports `0gkit-testing`; conformance suites are offline-safe

**Date:** 2026-07-01 · **SP:** K5

The `0g test` CLI command loads `@foundryprotocol/0gkit-testing` via a computed dynamic `import()` specifier (reusing the D39 lazy-import pattern). This keeps `0gkit-testing` out of the CLI cold-start path. The conformance suites (`storage`, `compute`, `da`, `wallet`) are pure functions over injected factory objects — they do not open live sockets or call the 0G network directly, so they run fully offline in CI without depending on Aristotle or any other live node.

**Why:** `0gkit-testing` pulls in test-framework peer deps that are inappropriate in the CLI's runtime. The D39 pattern keeps CLI startup fast. Offline-safe suites mean `pnpm test` in CI never races against network availability.

**How to apply:** Every new conformance suite must accept all network clients as injected parameters (never import them at module scope). `0g test` must resolve the `0gkit-testing` specifier at call time, not import it at the top of `cli.ts`. To add a new suite, export it from `0gkit-testing/suites` and register it in the `SUITES` map in `cli/src/commands/test.ts`.

---

## D85 — `0g doctor --fix` is advisory-only; it never auto-installs or mutates network state

**Date:** 2026-07-01 · **SP:** K5

`0g doctor --fix` applies exactly three classes of fix: (1) writes a missing `.env` file from a safe template, (2) prints the `npm install @foundryprotocol/0gkit-*@<latest>` command for stale pins (never runs it), (3) prints the `0g dev --network <fallback>` command when the primary RPC is unreachable (never switches the active network). Without `--fix`, every check that has a remediation prints a `→ run <cmd> to fix` hint. Checks that have no safe automatic fix always print the hint and never attempt a fix even with `--fix`.

**Why:** Auto-installing packages in a production project can silently upgrade unrelated deps, break lockfiles, and violate change-management policies. Auto-switching networks can cause a running application to silently switch chains. Advisory output keeps the doctor safe to run in any environment.

**How to apply:** New doctor checks must expose a `fixCmd` string (or `null`). The check runner prints `→ run <fixCmd> to fix` regardless of `--fix`. If `--fix` is set and `fixCmd` is a known safe mutation (`.env` write), the runner may execute it directly and print "✓ fixed". Never add a new check whose fix auto-runs `npm install`, `pnpm install`, or any network-mutating command.

---

## D86 — `applyKit` persists `.0gkit/kits.json`; `0g test --kits` reads it; missing manifest = informational note

**Date:** 2026-07-01 · **SP:** K5

After every successful `applyKit` call, the engine writes (or merges into) `.0gkit/kits.json` in the target project root. The schema is `{ applied: string[], base: string, at: string (ISO timestamp) }`. `0g test --kits` reads this manifest to discover which kits are installed and runs only those suites. If the manifest file does not exist or lists no kits, the command prints an informational note and exits 0 — it is never treated as a test failure.

**Why:** K0 shipped `applyKit` without recording what was applied, so there was no machine-readable way to know which kits a project uses. This closed that gap. The "no manifest = informational" rule prevents `0g test --kits` from becoming a gate that breaks projects that were scaffolded before K5.

**How to apply:** Do not delete or gitignore `.0gkit/kits.json` from project roots. When adding a new kit, ensure `applyKit` merges the new kit name into the `applied` array (never overwrites). If writing a script that uses kit state, read `.0gkit/kits.json` — do not infer kit presence from file existence heuristics.

## D87 — Kit MCP tools reach editors via the neutral plugin seam, wired inside the user's own project

**Date:** 2026-07-01 · **SP:** K6

`create0gMcpServer({ plugins })` merges any `McpToolPlugin` (`{ name, tools, call }`) into the neutral tool list — the same seam the Foundry plugin already used. A neutral, generic `collectToolPlugin(name, register, opts?)` adapts a kit adapter's high-level `register(server, opts)` (`server.tool(...)`) function into that plugin shape. Each `mcp-agent` kit adapter exports an additive `mcpToolPlugin` factory. When a project scaffolded from the `mcp-agent` base has kits applied, `applyKit` generates a `src/kits.ts` aggregator that imports each applied kit's `mcpToolPlugin` and passes them to `create0gMcpServer`. The published `@foundryprotocol/0gkit-mcp` imports **no** kit overlay and reads **no** `OGKIT_MCP_KITS` env — the kit tools run only because the user's own project server loads them.

**Why:** The original K6 draft proposed making the published neutral server expose kit tools by writing an `OGKIT_MCP_KITS` env into the config. The reality-check found the server never read such a var (it serves a fixed `[...TOOLS]`), `adapters["mcp-agent"]` is a base-template adapter (not an "MCP tools" signal), and the kit adapters targeted the high-level `McpServer.tool()` API the low-level `Server` from `create0gMcpServer` never had — so the shipped adapters were not even wireable. Faking the env would have violated the honesty invariant. Routing kit tools through the real plugin seam, inside the user's project, is honest and preserves neutrality (D78).

**How to apply:** To expose kit tools to an editor, run the kit's server locally (a kitted `mcp-agent` project) — do not expect `npx @foundryprotocol/0gkit-mcp` to serve them. New kit MCP adapters must export `mcpToolPlugin` and keep their `register*Tools` export. Never add a static kit import to `0gkit-mcp`; `boundary:check` must stay green.

## D88 — `0g mcp init <agent>` writes editor config only; neutral by default, local for kitted mcp-agent projects

**Date:** 2026-07-01 · **SP:** K6

`0g mcp init <agent>` writes the MCP config for `cursor | claude | windsurf | codex` and never installs a server. By default the config runs `npx -y @foundryprotocol/0gkit-mcp` (the nine neutral `og_*` tools). When run in **project** scope inside a project whose `.0gkit/kits.json.base === "mcp-agent"` with ≥1 applied kit, it instead writes `npm --prefix <project> start` so the editor runs the local kitted server (kit tools included). `--global` writes the agent's user-level path and is always neutral. The CLI lazy-imports `0gkit-mcp` (D39); `0gkit-mcp` is a runtime `dependency` of `0gkit-cli` so `0g mcp init` resolves for global installs.

**Why:** Project scope keeps the config committable and lets it travel with the repo. Local mode is the honest delivery of the kit-tool synergy (D87) — it only triggers where a local kitted server actually exists. `--global` cannot point at a specific project, so it stays neutral. Making `0gkit-mcp` a real dependency (not devDependency) fixes the case where a globally-installed CLI could not resolve the lazy import.

**How to apply:** Add new agents by extending the `AGENTS` list and `PATHS` table in `0gkit-mcp/config-init.ts`. Keep `buildMcpConfig` pure (path/JSON only); do not have it install anything. Local mode must remain gated on project scope + `mcp-agent` base + applied kits.

## D89 — `Compute.router()` wires the real 0G Router endpoint; client-side selection is the labelled fallback

**Date:** 2026-07-01 · **SP:** K7

The T0 research gate ([`docs/research/2026-07-01-0g-router-api.md`](research/2026-07-01-0g-router-api.md)) confirmed the **0G Router is a real, OpenAI-compatible server endpoint** — `router-api.0g.ai/v1` (mainnet) / `router-api-testnet.integratenetwork.work/v1` (testnet), `Authorization: Bearer <ROUTER_API_KEY>`, server-side selection + failover, `sort` routing knob, models at `/v1/models`. So `Compute.router()` **wires it**: with `cfg.routerApiKey` set it POSTs an OpenAI-compatible body to `${routerUrl}/chat/completions`; `routerUrl` defaults by network. With **no** key it falls back to honest client-side selection — `listProviders()` → pure `selectProviders()` (model-first, `prefer` head) → `inference({ provider })` across candidates with retry/fallback — and emits a one-time note. Zero reachable providers throws a typed `NetworkError`; the managed path without a model throws `ConfigError`.

**Why:** The honesty rule requires wiring a confirmed endpoint rather than shipping a client-side stand-in and calling it "the Router." But the Router's auth (an API key from the pc.0g.ai Web UI) differs from our wallet-signer/broker path, and key issuance is Web-UI-only — so the user brings a key, and wallet-signer users still get a real, working router via the client-side fallback. Neither path fabricates provider fields; the fallback is explicitly labelled. `selectProviders`/`toProviderInfo` are pure and network-free (unit-tested, no Aristotle gating, D10).

**How to apply:** Never fabricate a Router request field beyond the documented `sort`. If 0G ships programmatic key issuance or a provider-pin request field, extend the endpoint path only — the public `router()` surface stays fixed. Keep the client-side fallback's one-time "set ROUTER_API_KEY" note.

## D90 — `router()`/`direct()` are additive; `inference()` gains an optional per-call `provider` (no rename)

**Date:** 2026-07-01 · **SP:** K7

`Compute.router()` and `Compute.direct()` are new methods; `Compute.inference()` keeps its published signature and behaviour. `inference()`/`InferenceArgs` gain an **optional** `provider?` that overrides `cfg.provider` (via `requireProvider(override?)`) — additive, so v1.x callers are unaffected. `direct()` is a thin forwarding alias for the explicit-provider path. `router()` resolves `model` from `args.model ?? cfg.model` and `prefer` from `args.prefer ?? cfg.provider`, so templates that pin a model/provider on the client don't repeat it per request. New config: `routerApiKey`, `routerUrl`. This honours D13 (no rename of the published `Compute` surface).

**Why:** `inference()` reads a constructor-time `provider`; `router()`'s client-side fallback needs to try a _different_ provider per candidate, and `direct()` needs a per-call provider — both are impossible without the per-call override. Making it optional keeps the change additive. Defaulting `prefer`/`model` from config preserves the existing `PROVIDER`/`MODEL` pin semantics through the migration to `router()`.

**How to apply:** Adding compute call-args is fine; never remove or rename `inference()`. New templates/kits default to `router()`; use `direct({ provider })` only for an owned provider relationship.

## D91 — templates and compute-calling kits default to `router()`

**Date:** 2026-07-01 · **SP:** K7

The three compute-calling base templates (`inference-app`, `ai-agent`, `tee-attested-api`) and all 14 compute-calling kit adapters (`ai-oracle`, `sealed-inference`, `yield-intel`, `prediction-market`) call `compute.router()`, not `inference()`. `inference-app`'s hand-rolled `listProviders()`+pick is deleted in favour of `router()`. Each surfaces `ROUTER_API_KEY` (managed Router opt-in) alongside its wallet credential; `PROVIDER` becomes a `prefer` pin.

**Why:** Every kit adapter and `ai-agent`/`tee` constructed `new Compute({ signer })` **without a provider**, so `inference()` would have thrown `ConfigError` at runtime — a latent bug. `router()` discovers/selects a provider, fixing them _and_ delivering the model-first default. This is real synergy, not a flag (contrast the K6 fiction, D87). Verified end-to-end by `kits:check` (27/27 kit×base combos type-check the router() adapters against real types) — which also fixed the K6 follow-up where `check-kits.mjs` staged the overlay flat instead of tier-prefixed.

**How to apply:** New compute-calling templates/kit adapters call `router()` and pass `ROUTER_API_KEY` through. `kits:check` must stay green (`copyKitTiersToOverlay` mirrors the real giget tier-prefixed layout).
