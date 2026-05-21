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

## D5 — Initializer is `create-0g-app`, not `create-0gkit-app`

**Date:** 2026-05-20 · **SP:** SP1

`npm create 0g-app` (which resolves to a package named `create-0g-app`) wins muscle memory for `npm create <thing>`. `create-0gkit-app` is the defensive registration but is **not** the primary entry. We register both names on npm; the `create-0gkit-app` package is a 3-line shim that prints `→ use 'npm create 0g-app' instead` and exits 1.

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
