# 0gkit Essentials Roadmap — the CRA-grade builder kit for 0G

> **Status:** Draft v1 · **Owner:** Raj · **Date:** 2026-05-20
> **Scope:** Everything needed for `npm create 0gkit-app` to be the obvious starting point for any developer building on 0G — and for that app to scale to production without ripping out the toolkit.

## 0. North Star

> **No one should start a 0G project without 0gkit, the same way no one starts a React app without `create-react-app` (or `create-next-app`).**

We have shipped the primitives (`@foundryprotocol/0gkit-{core,chain,storage,compute,da,attestation,cli,mcp,react}` v0.1.1, published on npm). That earns us a place on the shelf. It does **not** earn us the default starting position, because today a new builder has to:

1. Find raw template repos and `degit` them manually.
2. Hand-write a wallet — every example takes a raw `privateKey: string`.
3. Wait on a slow, rate-limited Galileo faucet to drip funds before they see anything work.
4. Hand-write ABIs to interact with on-chain contracts.
5. Build their own indexer, cost estimator, error pages, tests, and CI.

This document specifies the **12 sub-projects (SP1–SP12)** in **4 phases** that close that gap. Each sub-project produces shippable value on its own; each phase produces a developer-visible milestone. The ordering is constrained by what unlocks what; the value at each step is explicit.

This is the spec — the **what** and **why**. Implementation plans (the **how**, decomposed into TDD-sized tasks) live under `docs/plans/YYYY-MM-DD-sp{N}-*.md` and will be written one phase ahead of execution.

---

## 1. Hard Invariants

These survive every sub-project. They are non-negotiable.

| #   | Invariant                                                                                                                                                                                                                                                                                                                                                             | Enforcement                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| I1  | **Protocol neutrality.** No `@foundryprotocol/0gkit-*` package may import any `@foundryprotocol/*` non-0gkit package (e.g. the Foundry SDK), statically or dynamically with a literal specifier.                                                                                                                                                                      | `pnpm boundary:check` (dependency-cruiser); a `boundary.test.ts` in each surface package |
| I2  | **Layering.** Layer 0 = `0gkit-core`. Layer 1 = `0gkit-{chain,storage,compute,da,attestation}`. Layer 2 = surfaces (`0gkit-cli`, `0gkit-mcp`, `0gkit-react`, `0gkit-wallet`, `0gkit-contracts`, `0gkit-indexer`, `0gkit-testing`, `0gkit-jobs`, `0gkit-observability`). Layer 3 = `apps/*`, `templates/*`, `create-0gkit-app`. Lower layers never import higher ones. | depcruise rule + CI                                                                      |
| I3  | **One thing per package.** A package gets split, not bloated. We'd rather ship `0gkit-wallet` + `0gkit-wallet-react` than have a wallet folder inside `0gkit-react`.                                                                                                                                                                                                  | Code review                                                                              |
| I4  | **MIT license, public.** Everything ships under MIT. No `dependencies: { "@foundryprotocol/proprietary": "*" }`.                                                                                                                                                                                                                                                      | `LICENSE` + `package.json` check                                                         |
| I5  | **Every public API has a docs page.** A package without a `docs/packages/<name>` page is incomplete.                                                                                                                                                                                                                                                                  | `pnpm docs:check` (new — added in SP12)                                                  |
| I6  | **Every published package has tests.** 80/70 line/branch gate (the existing standard).                                                                                                                                                                                                                                                                                | `vitest --coverage` + CI                                                                 |
| I7  | **Every change ships through changesets.** No silent releases.                                                                                                                                                                                                                                                                                                        | `changeset` enforced in PR template                                                      |
| I8  | **No raw `privateKey: string` in any new surface API.** Existing primitives keep their `privateKey` constructor for back-compat, but every new surface (templates, hooks, CLI commands, MCP tools) takes a `Signer`/`Wallet` abstraction from `0gkit-wallet`.                                                                                                         | API review (SP3 lands the abstraction; SPs after SP3 follow it)                          |

---

## 2. Phase Overview

| Phase                                     | Sub-projects                                                                                                   | Duration target | Developer-visible milestone                                                                                                                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 1 — The Front Door**              | SP1 `create-0gkit-app` v1, SP2 `0g dev` local stack                                                            | ~2 weeks        | `npm create 0gkit-app my-app && cd my-app && pnpm dev` opens a working app against a local 0G stack in under 60 seconds. **No faucet, no .env archaeology, no testnet.**                                            |
| **Phase 2 — Production-Grade Foundation** | SP3 `0gkit-wallet`, SP4 `0gkit-contracts`, SP5 `0gkit-testing`                                                 | ~3 weeks        | The same scaffolded app uses wagmi-style wallet connect, typed contract clients, and ships with a vitest suite that passes against the local stack. No more raw `privateKey` strings; no more hand-written ABIs.    |
| **Phase 3 — Second-Day Developer Wins**   | ✅ SP6 `0gkit-indexer`, SP7 cost estimator + dry-run, SP8 expanded template library                            | ~3 weeks        | The five canonical archetypes (`chat`, `storage-app`, `ai-agent`, `tee-attested-api`, `nft-with-storage`) all ship; `0g estimate` and `.dryRun()` save users from surprise bills; event subscriptions are one hook. |
| **Phase 4 — Ecosystem Moat**              | SP9 error taxonomy, SP10 `0gkit-jobs`, SP11 `0gkit-observability`, SP12 community + CI templates + docs polish | ~3 weeks        | Every `ZeroGError` links to a docs page that fixes it; long-running compute jobs are durable; production apps emit OTel spans; CI/CD workflows are one copy-paste away.                                             |

**Total target:** ~11 weeks of focused work to graduate from "primitives shipped" to "default starting point for 0G."

Each sub-project below lists: **Goal · Why this matters · Package(s) · Public surface · Depends on · Success criteria · Value shipped.**

---

## Phase 1 — The Front Door

> Without this phase, the rest is invisible. The initializer + local devnet are symbiotic: the initializer drops you into a project, the local devnet makes that project run instantly. Neither alone delivers the "wow" moment; together they do.

### SP1 — `create-0gkit-app` (the npm initializer)

**Goal:** `npm create 0gkit-app@latest my-app` (or `pnpm create 0gkit-app my-app`, `yarn create 0gkit-app my-app`) scaffolds a runnable 0G app in under 30 seconds.

**Why this matters:** Modern web developers reach for `npm create <thing>`, not "install this binary, then run `0g init`". The current `0g init` works but is invisible to anyone who hasn't already discovered our CLI. The npm initializer is the universally-discoverable front door. Frameworks that don't have one (looking at you, raw libraries) lose the default position to ones that do (Next.js, SvelteKit, Astro, Vite).

**Package:** `create-0gkit-app` (published at root of npm scope so `npm create 0gkit-app` resolves correctly). `create-0g-app` is private because the npm name is held by another publisher.

**Public surface:**

```
npm create 0gkit-app@latest <name>
  [--template <storage|inference|chat|ai-agent|tee-api|nft-storage|blank>]
  [--package-manager <pnpm|npm|yarn|bun>]
  [--network <galileo|local>]   # default: local (SP2)
  [--git/--no-git]
  [--install/--no-install]
  [--example]                    # interactive picker
```

Interactive mode (no `--template`): prompts for name → template → package manager → network → git? → install?

Outputs:

- A new directory `<name>/` with the chosen template, deps installed, git initialised, a `.env.example` filled with sensible defaults for the chosen network, and a one-line "next step" banner that says exactly what to run.

**Depends on:** Existing templates under `templates/*`. (SP8 will expand the template set; SP1 ships with the 5 we already have.)

**Success criteria:**

- `npx create-0gkit-app@latest demo --template storage-app --network local --install` completes in ≤ 45s on a clean machine with a warm npm cache; the scaffolded `demo/` runs `pnpm start` successfully against the local stack from SP2.
- `npm create 0gkit-app demo`, `pnpm create 0gkit-app demo`, `yarn create 0gkit-app demo` all work (use [`giget`](https://github.com/unjs/giget) for degit; avoid `create-` package quirks by following the [npm-init spec](https://docs.npmjs.com/cli/v10/commands/npm-init) — the binary is `create-0gkit-app` not `0gkit-app`).
- Templates are fetched from the same monorepo `templates/<name>` via a [pinned git ref](https://github.com/rajkaria/0gkit/tree/v0.2.x/templates) so we don't serve broken templates from `main`.
- Coverage 85% on `create-0gkit-app` package (it's small and critical).
- An e2e smoke test in CI runs `create-0gkit-app storage-app` in a tmpdir and asserts `pnpm build` exits 0.

**Value shipped:** The 30-second on-ramp. A developer who has never heard of 0G can type one command and have a running app. This is the moment the toolkit becomes the default.

---

### SP2 — `0g dev` (local devnet + service mocks)

**Goal:** `0g dev` spins up a complete local 0G environment — chain, storage, compute, DA — with 10 pre-funded dev wallets and a printed mnemonic. Apps developed against it work unchanged on Galileo testnet later.

**Why this matters:** Galileo's faucet is slow, rate-limited, and goes down. Nobody wants to iterate on a feature when each test costs a 60s faucet round-trip. The whole reason `create-react-app` won was that `npm start` opened `localhost:3000` instantly — no deploy, no DNS, no waiting. **0G's equivalent doesn't exist today and it's the single biggest reason builders churn out after their first hour.**

**Package:** `@foundryprotocol/0gkit-cli` (extend with `dev` command) + a new internal `@foundryprotocol/0gkit-devnet` package that owns the mock services.

**Public surface:**

```
0g dev                                  # start everything on localhost
  [--port-chain 8545]                   # anvil
  [--port-storage 5678]                 # mock storage node (HTTP)
  [--port-compute 5679]                 # mock compute provider
  [--port-da 5680]                      # mock DA node
  [--accounts 10]                       # pre-funded dev wallets
  [--mnemonic "<phrase>"]               # deterministic accounts
  [--state-dir ./.0g-dev]               # persist storage across restarts
  [--verbose]
  [--quiet]

0g dev stop
0g dev status
0g dev reset                            # nukes state-dir
0g dev fund <address> [--amount 100]    # mint native to address
```

Internals:

- **Chain:** `anvil` (we shell out; it's the established devnet for EVM chains, and 0G is EVM-compatible). We don't reinvent.
- **Storage mock:** Local Node HTTP server that implements the `@0gfoundation/0g-storage-ts-sdk` upload/download API surface against a filesystem-backed CAS at `.0g-dev/storage/<merkle-root>`. Computes the same Merkle root the real network would (we already have the impl in `0gkit-storage`).
- **Compute mock:** Local OpenAI-compatible HTTP server that proxies to either (a) an actual local model via Ollama if detected, or (b) a deterministic stub that echoes the prompt with a `[MOCK]` prefix. Same provider-discovery + broker shape as the real compute network so client code is identical.
- **DA mock:** In-memory store keyed by canonical digest; serves `publish` + `verify` with the same shapes.
- **Network preset:** A new `local` network in `0gkit-core`'s `networks.ts` pointing all four services at the local ports. Apps switch between `local` and `galileo` by changing one constant.

**Depends on:** SP1 ships with a `--network local` flag that wires the scaffolded `.env.example` to localhost. The two land together.

**Success criteria:**

- `0g dev` starts in ≤ 5s on a developer laptop and prints the 10 funded accounts + mnemonic.
- `0gkit-storage`, `0gkit-compute`, `0gkit-da` clients work against the local stack with **zero code changes** — only the network preset differs.
- A new vitest fixture `setupLocalDevnet()` in `0gkit-testing` (SP5) starts/stops the devnet per test file.
- e2e: the SP1 scaffolded `storage-app` template runs `pnpm start` against `0g dev` and uploads → downloads → verifies bytes round-trip, all offline.
- `0g dev status` correctly reports up/down per service; `0g dev reset` clears state and re-funds accounts.

**Value shipped:** The fast inner loop. Builders stop fighting the faucet and start shipping. This is what graduates 0G from "interesting demo" to "platform you can build a business on."

---

## Phase 2 — Production-Grade Foundation

> Phase 1 makes new apps appear. Phase 2 makes those apps **good**. Each sub-project replaces a current sharp edge with the production-shaped thing.

### SP3 — `@foundryprotocol/0gkit-wallet`

**Goal:** Eliminate `privateKey: string` from the developer experience. Provide wagmi-style connectors, server-side SIWE, and pluggable secure-key loaders (env / file / KMS / HSM).

**Why this matters:** Every current example does `new StorageClient({ privateKey: process.env.PRIVATE_KEY })`. That is a footgun and a production no-go. Real apps need: (a) browser wallets (MetaMask, Coinbase, Rainbow, Rabby), (b) server-side signing with a key the app never sees in plaintext, (c) a unified `Signer` abstraction the rest of `0gkit-*` can consume so we never have two code paths.

**Package:** `@foundryprotocol/0gkit-wallet` + thin React adapter at `@foundryprotocol/0gkit-wallet-react`.

**Public surface (Node/universal):**

```ts
import {
  Signer,
  WalletProvider,
  fromPrivateKey,
  fromEnv,
  fromKMS,
  fromFile,
} from "@foundryprotocol/0gkit-wallet";

const signer: Signer = await fromEnv(); // reads PRIVATE_KEY or KEY_FILE etc.
const signer: Signer = await fromKMS({ keyId: "..." });
const signer: Signer = await fromPrivateKey("0x...");
const signer: Signer = await fromFile("./key.json", { password: "..." });

await signer.address;
await signer.signMessage(bytes);
await signer.signTypedData(domain, types, value);
await signer.sendTransaction(tx);
```

**Public surface (React):**

```tsx
import {
  ZeroGWalletProvider,
  useWallet,
  useConnect,
  useSwitchNetwork,
} from "@foundryprotocol/0gkit-wallet-react";

<ZeroGWalletProvider
  config={{ network: "galileo", connectors: ["injected", "walletConnect"] }}
>
  <App />
</ZeroGWalletProvider>;

const { address, isConnected, signer, disconnect } = useWallet();
const { connect, connectors, isPending } = useConnect();
const { switchNetwork } = useSwitchNetwork();
```

**Public surface (SIWE):**

```ts
import { siwe } from "@foundryprotocol/0gkit-wallet";

// Server
const nonce = siwe.generateNonce();
const isValid = await siwe.verify({ message, signature, expectedNonce: nonce });
// returns { ok: true, address } | { ok: false, reason }
```

**Refactors required:**

- Every primitive (`0gkit-storage`, `0gkit-compute`, `0gkit-da`, `0gkit-attestation`, `0gkit-chain`) gets a new constructor signature: `new StorageClient({ signer: Signer })` in addition to the existing `{ privateKey }`. Old surface stays for one minor version with a deprecation warning, then removed.
- All Phase 3+ surfaces (templates, React hooks, CLI commands, MCP tools) take `Signer`, not `privateKey`.

**Depends on:** Layer 1 packages (already shipped) — pure additive on top.

**Success criteria:**

- A scaffolded `react-app` template connects MetaMask, signs a SIWE message, and uses the resulting signer for an upload — no `privateKey` anywhere in user code.
- `fromKMS` works against AWS KMS (a smoke test gated on credentials in CI).
- The five existing templates compile against both old (`privateKey`) and new (`signer`) constructor for one release cycle.
- Coverage 85% on the wallet package (it touches keys — bar is higher).

**Value shipped:** Production-shaped credentials. You can show this app to a security reviewer and they don't laugh you out of the room.

---

### SP4 — `@foundryprotocol/0gkit-contracts` ✅ SHIPPED

**Status:** shipped 2026-05-21. Implementation plan: `docs/plans/2026-05-21-sp4-0gkit-contracts.md`. Released on `main`.

**Goal:** wagmi-style codegen for typed contract clients. Out of the box: ABIs for the 0G "standard" on-chain contracts (registry, attestation verifier, token contracts, multicall). Out of the box: a `0g contracts generate` command that consumes Foundry/Hardhat artifacts and emits a fully typed client.

**Why this matters:** Hand-writing ABIs is consistently the #1 reason newcomers abandon Web3 projects (true on every chain; 0G is no exception). They wire up the SDK, get to "now I need to call my contract", and discover they're typing `["function balanceOf(address) view returns (uint256)"]` into a config file. A modern dev expects `myContract.read.balanceOf(address)` with full IntelliSense.

**Package:** `@foundryprotocol/0gkit-contracts` + CLI subcommands under `0g contracts`.

**Public surface (built-in standard contracts):**

```ts
import { standardContracts } from "@foundryprotocol/0gkit-contracts";

const registry = standardContracts.registry({ network: "galileo", signer });
const provider = await registry.read.getProvider(providerId);
const tx = await registry.write.registerProvider({ ... });
```

**Public surface (custom codegen):**

```bash
0g contracts generate \
  --abi ./out/MyContract.sol/MyContract.json \    # Foundry artifact
  --out ./src/contracts                            # generated typed clients
  --watch                                          # regenerate on change
```

Emits one `.ts` per contract with read methods, write methods, event types, and a typed factory:

```ts
import { MyContract } from "./contracts/MyContract";

const c = MyContract.attach({ address: "0x...", signer });
const value = await c.read.totalSupply(); // typed bigint
const tx = await c.write.transfer(to, amount); // typed tx
const events = await c.events.Transfer({ fromBlock: 0n });
```

**Refactors required:**

- `0gkit-cli`: add `contracts` subcommand group.
- `0gkit-react` (later): a `useContract({ abi, address })` hook (lands in SP6 with indexer).

**Depends on:** SP3 (`Signer` abstraction). Pure additive otherwise.

**Success criteria:**

- The five standard 0G contracts ship with typed clients out of the box.
- `0g contracts generate` produces compilable, fully-typed TS from a real Foundry artifact in a fixture test.
- A `nft-with-storage` template (SP8) uses `0g contracts generate` in its `predev` script.
- Generated code passes `tsc --strict --noEmit` with zero `any`.

**Value shipped:** Contract calls feel like calling a typed function in any other library. The ABI vanishes from user code. We close the #1 churn driver for new builders.

---

### SP5 — `@foundryprotocol/0gkit-testing` ✅ SHIPPED

**Status:** shipped 2026-05-21. Implementation plan: `docs/plans/2026-05-21-sp5-0gkit-testing.md`. Released on `main`.

**Goal:** Mock providers, fixture receipts, deterministic test environments, and vitest matchers for 0G semantics.

**Why this matters:** Apps don't ship without a test suite. Today, testing a 0G app means either (a) hitting Galileo from CI (slow, flaky, costs faucet tokens), (b) hand-rolling mocks (each team writes the same mock, badly), or (c) skipping tests (don't). A first-class testing package converts test-writing from a tax to a feature.

**Package:** `@foundryprotocol/0gkit-testing`.

**Public surface:**

```ts
import {
  setupLocalDevnet, // starts/stops SP2's `0g dev` per test file
  mockStorageClient, // in-memory StorageClient
  mockComputeClient, // deterministic LLM responses
  fixtureReceipt, // a synthesised Receipt for unit tests
  fixtureAttestation, // a valid signed attestation
  testWallet, // deterministic Signer (HD-derived)
} from "@foundryprotocol/0gkit-testing";

import { expect } from "vitest";
import "@foundryprotocol/0gkit-testing/matchers";

expect(receipt).toBeConfirmedOn0G();
expect(receipt).toHaveRootMatching(/^0x[0-9a-f]{64}$/);
expect(attestation).toBeValidAttestation();
expect(error).toBeZeroGError("STORAGE_QUOTA_EXCEEDED");
```

Vitest matchers:

- `toBeConfirmedOn0G()` — checks status, block, and confirmations.
- `toHaveRootMatching(regex)` — root format + Merkle validity.
- `toBeValidAttestation()` — signature recover + signer match.
- `toBeZeroGError(code)` — typed error code assertion.

**Depends on:** SP2 (`0g dev`), SP3 (`Signer` for `testWallet`).

**Success criteria:**

- The vitest suites in every `0gkit-*` package migrate at least one suite to use `0gkit-testing` mocks (proving the API is real, not just demo'd).
- Test runs that previously took ~30s (with real network calls) drop to ~3s using mocks.
- `setupLocalDevnet({ autoStart: true })` in a vitest `globalSetup` works.
- Coverage 80% on the testing package (lower bar because most of it is itself test scaffolding).

**Value shipped:** Test-writing is now a one-line setup. The "I'll add tests later" excuse dies.

---

## Phase 3 — Second-Day Developer Wins

> Phase 2 gets the new builder to a production-shaped app. Phase 3 hands them the tools they reach for on day two: an event subscription, a "wait, how much will this cost?" check, and the rest of the templates.

### SP6 — `@foundryprotocol/0gkit-indexer`

**Status:** Shipped 2026-05-22.

**Goal:** Reorg-safe, persisted-cursor event subscriptions on the 0G chain, with a React adapter.

**Why this matters:** Every dapp needs to react to events: "new upload by user X", "attestation registered for compute job Y", "token transfer to contract Z". Today builders either poll naively (misses reorgs, duplicates events) or build their own subscriber (six hours of work nobody finds fun). A first-class indexer turns this into a one-hook problem.

**Package:** `@foundryprotocol/0gkit-indexer` + React adapter in `0gkit-react`.

**Public surface (Node/universal):**

```ts
import { Indexer } from "@foundryprotocol/0gkit-indexer";

const indexer = new Indexer({
  network: "galileo",
  cursor: { kind: "sqlite", path: "./.cursors.db" }, // or "redis" | "memory"
});

await indexer.subscribe({
  contract: registry, // typed contract from SP4
  event: "ProviderRegistered",
  fromBlock: "latest" | "earliest" | 12345n,
  onEvent: async (event) => {
    /* ... */
  },
  onReorg: async (rolledBack) => {
    /* ... */
  },
});

await indexer.start();
await indexer.stop();
```

**Public surface (React):**

```tsx
import { useEvent, useLogs } from "@foundryprotocol/0gkit-react";

const { events, isLoading } = useEvent({
  contract: registry,
  event: "ProviderRegistered",
  fromBlock: "latest",
});
```

Internals:

- Backoff with jitter on RPC errors.
- Reorg-safe: tracks last N blocks; emits a roll-back event on reorg.
- Cursor persistence (sqlite default, redis adapter, in-memory for tests).
- Multi-event multiplexing on a single subscription.

**Depends on:** SP4 (`Signer` + typed contracts), SP5 (testing fixtures for synthetic events).

**Success criteria:**

- A `chat` template (SP8) uses `useEvent` to render new messages live.
- A test that simulates a 3-block reorg correctly rolls back and re-emits.
- Cursor survives restart: stop, restart, no missed events.
- Coverage 85%.

**Value shipped:** Real-time UI on 0G is one hook. The whole class of "I need to react to chain state" problems collapses.

---

### SP7 — Cost estimator + dry-run

**Goal:** Every primitive answers the question "what will this cost me?" before you spend a thing.

**Why this matters:** Two failure modes today: (1) testnet — burn through your faucet drip on a tight loop and discover it the next day; (2) mainnet (future) — surprise bills. A 30-second `0g estimate` makes both go away.

**Surface lives across:** `0gkit-cli`, `0gkit-core` (the `.estimate()` method on each primitive), docs.

**Public surface (CLI):**

```bash
0g estimate storage ./big-file.bin
  # Prints: ~12 KB segments, ~$0.0003 native gas, ~$0.0021 storage fee, est. confirm 8s

0g estimate compute --prompt "..." --model meta-llama/Llama-3-8B
  # Prints: ~1.2k input tokens, ~250 output tokens estimated, ~$0.0009 inference fee

0g estimate da --bytes 4096

0g dry-run <any-other-command>
  # Runs the command but never broadcasts; prints what would have happened.
```

**Public surface (programmatic):**

```ts
const est = await storage.estimate(bytes);
// { sizeBytes, segments, gasNative, feeNative, expectedConfirmSeconds }

const est = await compute.estimate({ prompt, model });
// { inputTokens, outputTokensMax, feeNative }

const { receipt, dryRun } = await storage.upload(bytes, { dryRun: true });
// `dryRun: true` returns the estimate + simulated receipt without broadcasting.
```

**Depends on:** SP3 (signer; estimates depend on gas which depends on account). Otherwise additive across existing primitives.

**Success criteria:**

- All 4 primitives (`storage`, `compute`, `da`, attestation registration) implement `.estimate()` returning a typed `Estimate`.
- All write paths accept `{ dryRun: true }`.
- `0g estimate` snapshot tests confirm output stability.

**Value shipped:** No more cost-surprise. Builders develop a feel for what things cost, in their own terminal, before any tx broadcasts.

---

### SP8 — Template expansion (the five archetypes)

**Goal:** Ship the 5 templates that cover ~90% of new 0G projects, each demonstrating SP3–SP7 in idiomatic use.

**Why this matters:** Today's templates (`storage-app`, `inference-app`, `attestation-verify`, `mcp-agent`, `react-app`) are correct but minimal. The five archetypes builders actually want to start from are:

| Template                | What it shows                                                                         | New primitives demoed                        |
| ----------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------- |
| `chat`                  | Real-time chat UI; messages stored on 0G Storage; events indexed live                 | wallet + storage + indexer + React           |
| `storage-app` (refresh) | File uploader with progress, dedup, retrieval                                         | wallet + storage + estimator                 |
| `ai-agent`              | Multi-step LangChain agent calling 0G Compute, with TEE attestation per step          | wallet + compute + attestation + jobs (SP10) |
| `tee-attested-api`      | Express/Hono API where every response carries a TEE attestation header                | wallet + attestation + observability (SP11)  |
| `nft-with-storage`      | ERC-721 minter where metadata + media live on 0G Storage; uses typed contract codegen | wallet + storage + contracts                 |

Each template:

- Built fresh on top of SP3–SP7.
- Ships with vitest tests using `0gkit-testing`.
- Has a `pnpm dev` script that starts SP2's `0g dev` first.
- Has a `README.md` that walks through what each file does (so the template doubles as a tutorial).
- Is wired into `create-0gkit-app` as a first-class `--template` option.

**Depends on:** SP1, SP2, SP3, SP4, SP5, SP6, SP7.

**Success criteria:**

- `npx create-0gkit-app demo --template chat --network local --install && cd demo && pnpm dev` shows a working chat in the browser end-to-end.
- All five templates have ≥ 80% test coverage on their own code (not the libraries).
- Each template's README is reviewed by a teammate or AI critic with the prompt "would a junior dev be unblocked by this?".
- The docs site (`apps/docs`) generates one `docs/templates/<name>` page per template from the template README.

**Value shipped:** The five conversations that start "I want to build X on 0G" all get a 30-second answer ending in a working app. This is when 0gkit becomes the obvious answer.

---

## Phase 4 — Ecosystem Moat

> Phase 3 finishes the developer-facing surface. Phase 4 makes the toolkit the kind of thing other ecosystems envy.

### SP9 — Error taxonomy + `0gkit.dev/errors/<code>`

**Goal:** Every `ZeroGError` carries a stable error code and a documented fix URL. The docs site renders one page per error code with: what it means, the most common cause, the minimal repro, the fix.

**Why this matters:** Most builder pain isn't "the library is broken"; it's "I got an error and I don't know what to do." A taxonomy collapses that pain into "Google the code → land on the canonical page → fix in 30s." This is the single biggest force-multiplier on docs you can have, and it costs almost nothing to maintain because every error has exactly one home.

**Surface:** Updates `0gkit-core`'s `ZeroGError` to require `{ code: ErrorCode, helpUrl: string }`. Updates every package that throws to use a code from the canonical enum.

**Public surface:**

```ts
import { ZeroGError, ErrorCode } from "@foundryprotocol/0gkit-core";

try {
  /* ... */
} catch (e) {
  if (e instanceof ZeroGError) {
    console.error(`${e.code} — ${e.message}\nFix: ${e.helpUrl}`);
    // e.g. "STORAGE_QUOTA_EXCEEDED — Account 0x... is over its quota.
    //       Fix: https://0gkit.dev/errors/STORAGE_QUOTA_EXCEEDED"
  }
}
```

**Constraints:**

- Error codes are stable identifiers (SCREAMING_SNAKE). Adding a code is fine; renaming one is a semver-major change.
- Every code MUST have a docs page; CI fails if a thrown code is missing its page (`pnpm docs:check`).

**Depends on:** All other SPs (so the taxonomy reflects real, shipped errors).

**Success criteria:**

- All thrown errors across `0gkit-*` carry a code from the canonical enum (~30–50 codes total).
- `apps/docs/app/errors/<code>/page.mdx` exists for every code.
- `pnpm docs:check` is wired into CI and catches missing pages.
- A real builder bug (we'll pick one from a Discord/Issue archive) is resolved end-to-end via the error code → docs page workflow.

**Value shipped:** Builders unblock themselves. Support load drops. The docs site becomes a force multiplier instead of a maintenance burden.

---

### SP10 — `@foundryprotocol/0gkit-jobs`

**Goal:** Durable async job runner for long-running 0G Compute calls (and anything else that doesn't fit in a single request lifecycle).

**Why this matters:** A real inference call can take 30–120 seconds. Wrapping it in an HTTP request handler doesn't survive in any production deployment (Vercel functions, Cloudflare Workers, ECS tasks all cap request duration well below that). Today builders end up writing their own queue/poll/webhook plumbing. We do it once, correctly.

**Package:** `@foundryprotocol/0gkit-jobs`.

**Public surface:**

```ts
import { JobRunner, jobs } from "@foundryprotocol/0gkit-jobs";

const runner = new JobRunner({
  backend: { kind: "redis", url: process.env.REDIS_URL }, // or "sqlite" | "memory"
  webhook: { url: "https://my-app.com/api/jobs/webhook", secret: "..." },
});

// Define a job
const InferenceJob = jobs.define({
  name: "inference",
  input: z.object({ prompt: z.string(), model: z.string() }),
  output: z.object({ text: z.string(), attestation: z.string() }),
  handler: async ({ input, signer }) => {
    const compute = new ComputeClient({ signer });
    const { text } = await compute.chat(input);
    const att = await attestation.register({ text });
    return { text, attestation: att };
  },
});

// Enqueue
const jobId = await runner.enqueue(InferenceJob, { prompt: "...", model: "..." });

// Poll
const status = await runner.status(jobId);
// { state: "queued" | "running" | "done" | "failed", result?, error? }

// Or: webhook fires when state changes (HMAC-signed body).
```

Backends:

- `memory` (dev/test)
- `sqlite` (single-node prod)
- `redis` (multi-node prod)
- (extensible: `bullmq`, `cloudflare-queues`, etc.)

**Depends on:** SP3 (`Signer`), SP5 (testing).

**Success criteria:**

- `ai-agent` template (SP8) uses `0gkit-jobs` for a multi-step compute call that exceeds Vercel's 30s edge timeout, and the demo works on Vercel Fluid Compute (the default-Node.js runtime).
- Redis and sqlite backends both pass the same conformance test suite.
- Webhook signature verification has a documented example.
- Coverage 85%.

**Value shipped:** Long-running 0G compute calls now ship to production. No bespoke queue code.

---

### SP11 — `@foundryprotocol/0gkit-observability`

**Goal:** OpenTelemetry spans around every primitive operation, with a cost-attribution dashboard view in the docs site.

**Why this matters:** Production apps need to know what's slow, what's expensive, and what's failing. We're already in the request path for every storage/compute/DA/attestation call — instrumenting it once, centrally, gives every builder distributed tracing and cost telemetry for free. This is the kind of thing that gets us picked over a competitor toolkit on day one of a real production conversation.

**Package:** `@foundryprotocol/0gkit-observability`.

**Public surface:**

```ts
import { instrument0g } from "@foundryprotocol/0gkit-observability";

instrument0g({
  serviceName: "my-app",
  exporter: { kind: "otlp", endpoint: "https://otel.collector/v1/traces" },
  // Or use any OTel SDK auto-config; we just register our instrumentation.
});

// From here, every storage/compute/da/attestation call emits a span with:
//   span.name = "0gkit.storage.upload"
//   span.attributes = {
//     "0gkit.network": "galileo",
//     "0gkit.size_bytes": 12345,
//     "0gkit.gas_native": "1234567890",
//     "0gkit.fee_native": "...",
//     "0gkit.confirm_seconds": 8.2,
//     "0gkit.root": "0x...",
//   }
//   plus standard OTel http.* on the underlying RPC calls.
```

A `0g cost` CLI subcommand reads OTel-format traces (or a local sqlite buffer) and prints a per-operation cost breakdown.

**Depends on:** All primitives. Mostly a code-generation-style pass that wraps every public method with `withSpan(...)`.

**Success criteria:**

- Adding `instrument0g({...})` to any app immediately produces traces; no other code change.
- The OTel attribute names follow [semantic conventions](https://opentelemetry.io/docs/specs/semconv/) and a new `0gkit.*` namespace (documented).
- Docs page: how to wire up Honeycomb, Tempo, Datadog, Vercel Otel.
- Bundle-size budget: instrumentation adds < 20KB to a client bundle.

**Value shipped:** Production observability is a one-line add. Operators love it. Cost accountability becomes a feature, not a Slack thread.

---

### SP12 — Community + CI/CD templates + docs polish

**Goal:** Close the gaps that turn "a great toolkit" into "the obvious default."

**Includes:**

- **CI/CD templates:** `.github/workflows/0gkit-ci.yml` (test + boundary + typecheck), `.github/workflows/0gkit-deploy-vercel.yml`, GitLab equivalents, `.circleci/config.yml`. `create-0gkit-app` offers `--ci github|gitlab|circle|none`.
- **Vercel one-click deploy:** Every template has a `Deploy to Vercel` button in its README. The Vercel project is pre-configured with the right env-var prompts (NETWORK, PRIVATE_KEY or KMS_KEY_ID, OTEL_ENDPOINT).
- **GitHub Discussions** turned on in `0gkit`; pinned categories: Show-and-tell, Help, RFCs.
- **Issue + PR templates:** bug report, feature request, security issue, RFC. PR template enforces changeset.
- **`CONTRIBUTING.md` refresh:** how to run `0g dev`, how to add a template, how to add an error code, how to ship a sub-project plan.
- **Docs polish:** Every package page in `apps/docs` has a working in-browser example via the playground (Phase 1 of `apps/playground` is already wired). Every page is reviewed for "would a junior dev be unblocked here."
- **`pnpm docs:check`:** A new script that asserts every public export of every published package has a documentation page, and every error code has a docs page. Wired into CI.
- **First-class search** in the docs site (Algolia DocSearch or Pagefind).

**Depends on:** Everything. SP12 is the polish pass.

**Success criteria:**

- A new builder going from `npm create 0gkit-app` to "deployed to Vercel with CI on every push" takes < 10 minutes.
- The docs site has 100% public-export coverage (asserted by `docs:check`).
- The `0gkit` Discussions has the founder team plus at least one community responder actively answering.
- Lighthouse on `apps/docs` ≥ 95 across the board.

**Value shipped:** From "great kit" to "obvious default." This is the phase where ecosystem behaviour starts to compound — Discord threads, blog posts, dotfile templates other people maintain, all linking back to 0gkit.

---

## 3. Cross-cutting concerns

### Release cadence

- After each sub-project ships, cut a minor release (`0.X.0`) of every affected package via changesets. **Patch (`0.X.Y`) is for bugfixes only;** anything additive is a minor.
- Phase boundaries are good moments for a coordinated `@foundryprotocol/0gkit-*` "version-set" announcement (e.g., a release notes post).
- We stay on `0.x` semver throughout this roadmap; cut `1.0.0` at the end of Phase 4 once SP12 has landed and the docs site says "ready for production" without lying.

### Decision log

- Maintain `docs/DECISIONS.md` with append-only entries `Dn: <decision> — <date> — <why>`.
- Every API choice that survived a debate goes here. Future-Raj will thank present-Raj when somebody asks "why are connectors strings, not connector objects?"

### Plan documents

- For each SP about to be implemented, write a TDD-shaped plan at `docs/plans/YYYY-MM-DD-sp<N>-<slug>.md` using the `superpowers:writing-plans` skill convention (exact files, exact tests, exact commands, exact commits).
- Don't write all 12 plans up front — write each one phase-ahead so the spec gets a chance to absorb learnings from the previous phase.

### Out of scope (for this roadmap)

- A custom 0G smart-contract language or compiler (we ride EVM/Solidity).
- A 0gkit-branded UI component library (we point to shadcn/ui from templates instead).
- Native mobile SDKs (Swift/Kotlin) — these are a separate roadmap, not part of "the CRA equivalent."
- A managed cloud product on top of 0gkit — `0gkit-jobs`'s Redis backend is the closest we get; an actual hosted service is a business decision, not a sub-project here.

---

## 4. Risks and mitigations

| Risk                                                                        | Likelihood | Impact | Mitigation                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anvil` doesn't faithfully emulate 0G chain quirks (precompiles, gas model) | Medium     | High   | Phase 1 ships with `anvil --hardfork shanghai` + a documented "known divergences" list; SP2's mock storage/compute/DA are 0G-specific and don't depend on `anvil` quirks. If a quirk bites, we pin to a specific `anvil` build or fork.                              |
| `@foundryprotocol/0gkit-wallet` ends up reimplementing wagmi                | High       | Medium | We **don't** reimplement wagmi — we **wrap** it. The 0gkit-wallet package depends on `wagmi` and `viem`, and adds (a) 0G chain configs, (b) SIWE-for-0G helpers, (c) server-side key loaders that wagmi doesn't ship. This is explicitly called out in the SP3 plan. |
| Codegen for contracts duplicates wagmi-cli or abitype                       | Medium     | Low    | We build on top of `abitype` and emit thin wrappers; we do **not** roll our own ABI parser.                                                                                                                                                                          |
| `0g dev` storage mock diverges from real network behaviour                  | Medium     | High   | Conformance tests: a `0gkit-storage` test suite runs against BOTH the local mock and a Galileo testnet endpoint (the latter gated on a CI secret), and they must agree on observable behaviour.                                                                      |
| Scope creep — sub-projects start absorbing tangential features              | High       | Medium | The "out of scope" section above. Each SP's `Goal` line is one sentence; if a PR is doing something not implied by that sentence, it becomes a new SP.                                                                                                               |
| 0G mainnet launches mid-roadmap and shifts priorities                       | Low        | High   | This roadmap is the right roadmap regardless: every sub-project applies equally on Galileo or mainnet. Mainnet launch triggers a marketing pass (a blog post, a `1.0.0` release, a Vercel deploy template refresh), not a re-plan.                                   |

---

## 5. Open questions (answer before SP1 plan is written)

1. **Initializer package name:** resolved after SP1 release. `create-0g-app` was preferred but is held on npm; `create-0gkit-app` is the canonical public package.
2. **`0g dev` storage CAS layout:** filesystem (`.0g-dev/storage/<root>`) or sqlite-backed? Filesystem is simpler; sqlite is more portable across OSes. Recommend **filesystem** for v1.
3. **`0gkit-wallet` SSR strategy:** ship with React Server Components support out of the box, or document a Pages Router fallback? Next.js 16 is RSC-default; we should optimise for that.
4. **`0gkit-jobs` default backend:** sqlite (zero-deps) or memory (zero-deps + zero-disk)? Recommend **memory** as the default for `0g dev` story; sqlite as the documented choice for "I want a single-machine production app."
5. **Error code namespacing:** `STORAGE_*`, `COMPUTE_*`, `DA_*`, etc. — flat enum, or namespaced (`STORAGE.QUOTA_EXCEEDED`)? Flat is easier to grep; namespaced is easier to extend. Recommend **flat**.
6. **Mainnet timing assumption:** does anything in this roadmap need to wait on a mainnet launch? Currently no — everything works on Galileo today. Confirm before each phase kicks off.

---

## 6. Execution handoff

Once this spec is approved, the implementation order is **strictly sequential by sub-project number within a phase, and strictly sequential by phase across phases.** The two exceptions:

- **SP1 and SP2 ship together** (they are co-dependent and meaningless apart).
- **SP9 (error taxonomy) can begin in parallel with SP6–SP8** because it's mostly a refactor over already-shipped code, but it MUST land before Phase 4 closes.

For each sub-project, the workflow is the proven one from the original 0gkit build-out:

1. `superpowers:writing-plans` → produce `docs/plans/YYYY-MM-DD-sp<N>-*.md`
2. `superpowers:subagent-driven-development` (fresh implementer per task, two-stage review per task)
3. After all tasks pass: a final Opus-level review for taste, naming, and API ergonomics.
4. `superpowers:finishing-a-development-branch` → squash-merge after CI is fully green.
5. Changeset cut; npm publish via the existing release workflow; release notes appended to the docs site.

Then the next sub-project begins.

---

## 7. The one-sentence summary

**Phase 1 makes 0gkit discoverable; Phase 2 makes it credible; Phase 3 makes it sticky; Phase 4 makes it the obvious default — and at the end of the roadmap, "build something on 0G" and "start a 0gkit project" mean the same sentence.**
