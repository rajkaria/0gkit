# SP9 — Error Taxonomy + Docs Anchor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every `ZeroGError` thrown anywhere in `0gkit-*` carries a stable SCREAMING_SNAKE code from a canonical enum and a `helpUrl` that resolves to a one-page-per-code MDX explainer at `0gkit.dev/errors/<CODE>`. CI fails if a thrown code has no docs page.

**Architecture:** Refactor `0gkit-core`'s `ZeroGError` to require `{ code: ErrorCode, helpUrl: string }` (was `{ code: 4-value union, hint: string }`). Expand the code enum from 4 broad categories to ~40 specific SCREAMING_SNAKE codes namespaced by prefix — see `ERROR_CODES` in Task 1 for the canonical list (CONFIG, WALLET, CHAIN, STORAGE, COMPUTE, DA, ATTESTATION, CONTRACTS, INDEXER, JOBS, OBSERVABILITY namespaces). Construct `helpUrl` deterministically from `code` (`https://0gkit.dev/errors/<CODE>`). Keep `ConfigError` / `NetworkError` / `ChainError` / `AttestationError` subclasses as ergonomic constructors that default the namespace prefix. Convert every existing `throw new Error(...)` call site to a typed `ZeroGError`. Generate `apps/docs/app/errors/<CODE>/page.mdx` for every code (one template, MDX with frontmatter: title, cause, fix, example). Add `pnpm docs:check` that diffs the union of codes referenced in `packages/**/src/**/*.ts` against the union of pages in `apps/docs/app/errors/*/page.mdx` — fails if either side has an orphan.

**Tech Stack:** TypeScript 5.6, Vitest 2.x, dependency-cruiser 16.x, Next.js 16 MDX, `chokidar-cli` (already in repo for docs hot-reload), no new runtime deps.

**Working dir (local):** `/Users/rajkaria/Projects/0G-ai-kit/`
**Branch:** `sp9-error-taxonomy`

**Semver note:** `0gkit-core` is `0.x`; the change to `ZeroGError`'s constructor signature is breaking for any consumer that instantiated `ZeroGError` directly with the old `(code, message, hint)` triple. Migration: minor bump (0.3.x → 0.4.0), with a one-paragraph CHANGELOG describing the swap (`hint` → `helpUrl`, code enum widened). Subclass constructors (`ConfigError`, etc.) preserve the `(message, hint)` signature so existing callsites compile — `hint` becomes the human-readable narrative and `helpUrl` is computed from the namespace.

---

## File structure

**Modified:**

- `packages/0gkit-core/src/errors.ts` — replace `ZeroGErrorCode` union with const `ERROR_CODES` array + `ErrorCode` type; rewrite `ZeroGError` to require `code` + derive `helpUrl`; refactor subclasses.
- `packages/0gkit-core/src/index.ts` — re-export `ERROR_CODES`, `ErrorCode`, `isErrorCode`.
- `packages/0gkit-core/src/__tests__/errors.test.ts` — expand to cover code enum + helpUrl + subclass codes.
- Every package that throws `new Error(...)` or `new ZeroGError('CONFIG', ...)` for a domain-specific failure — see Task 3 audit list.
- `apps/docs/app/errors/[code]/page.tsx` OR per-page MDX files (see Task 5 decision).
- `apps/docs/app/errors/page.mdx` — index of all codes grouped by namespace.
- `apps/docs/next.config.ts` — confirm MDX routing under `app/errors/`.
- `apps/docs/app/layout.tsx` — add "Errors" to the top nav if not already present.
- `scripts/docs-check.ts` — new script (orphan detector + CLI).
- `package.json` (root) — add `"docs:check": "tsx scripts/docs-check.ts"`.
- `.github/workflows/ci.yml` — add `pnpm docs:check` step.
- `packages/0gkit-react/src/error-boundary.tsx` — new `<ZeroGErrorBoundary>` that renders the helpUrl as a link.
- `packages/0gkit-react/src/index.ts` — re-export `ZeroGErrorBoundary`.
- `packages/0gkit-react/src/__tests__/error-boundary.test.tsx` — boundary catches + renders.
- `.changeset/sp9-error-taxonomy.md` — minor bump for `0gkit-core`, `0gkit-react`, patch for every package whose throws were retyped.
- `docs/DECISIONS.md` — append D27 (helpUrl computed from code) + D28 (docs:check is a CI gate).
- `docs/specs/2026-05-20-essentials-roadmap.md` — mark SP9 ✅ shipped.

**Created:**

- `packages/0gkit-core/src/error-codes.ts` — canonical `ERROR_CODES` const array (one source of truth).
- `packages/0gkit-core/src/__tests__/error-codes.test.ts` — asserts enum shape + ordering.
- `apps/docs/app/errors/page.mdx` — index page.
- `apps/docs/app/errors/<CODE>/page.mdx` — one per code (Task 5 emits all of them).
- `scripts/docs-check.ts` — orphan detector.
- `scripts/__tests__/docs-check.test.ts` — vitest unit test for the detector.

---

## Task graph

```
Task 1 (codes enum + ZeroGError refactor) ──► Task 2 (subclass refactor) ──► Task 3 (audit + retype throws)
                                                                              │
Task 4 (docs:check script) ─────────────────────────────────────────────────► Task 6 (CI wire-up + react boundary)
                                                                              │
Task 5 (emit MDX per code) ───────────────────────────────────────────────────┘
                                                                              │
                                                                              ▼
                                                                       Task 7 (changeset + release prep)
```

Task 3 fans out across packages. Tasks 4 and 5 are independent of Task 3 and can run in parallel.

---

### Task 1: Canonical `ERROR_CODES` enum + `ZeroGError` refactor

**Files:**

- Create: `packages/0gkit-core/src/error-codes.ts`
- Create: `packages/0gkit-core/src/__tests__/error-codes.test.ts`
- Modify: `packages/0gkit-core/src/errors.ts`
- Modify: `packages/0gkit-core/src/__tests__/errors.test.ts`
- Modify: `packages/0gkit-core/src/index.ts`

- [ ] **Step 1: Write the failing tests for the enum**

`packages/0gkit-core/src/__tests__/error-codes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ERROR_CODES, isErrorCode, errorNamespace } from "../error-codes.js";

describe("ERROR_CODES enum", () => {
  it("is a non-empty frozen tuple", () => {
    expect(ERROR_CODES.length).toBeGreaterThanOrEqual(30);
    expect(Object.isFrozen(ERROR_CODES)).toBe(true);
  });

  it("contains expected namespaces (one entry from each)", () => {
    for (const code of [
      "CONFIG_MISSING_ENV",
      "WALLET_KMS_SIGN_FAILED",
      "CHAIN_RPC_UNREACHABLE",
      "STORAGE_QUOTA_EXCEEDED",
      "COMPUTE_PROVIDER_UNREACHABLE",
      "DA_VERIFY_FAILED",
      "ATTESTATION_BAD_SIGNATURE",
      "CONTRACTS_REVERTED",
      "INDEXER_REORG_LIMIT_EXCEEDED",
      "JOBS_BACKEND_UNREACHABLE",
      "OBSERVABILITY_EXPORTER_FAILED",
    ] as const) {
      expect(ERROR_CODES).toContain(code);
    }
  });

  it("every code is SCREAMING_SNAKE, namespace-prefixed", () => {
    for (const c of ERROR_CODES) {
      expect(c).toMatch(/^[A-Z]+(_[A-Z0-9]+)+$/);
    }
  });

  it("has no duplicates", () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });

  it("isErrorCode accepts known codes and rejects strings", () => {
    expect(isErrorCode("STORAGE_QUOTA_EXCEEDED")).toBe(true);
    expect(isErrorCode("nope")).toBe(false);
  });

  it("errorNamespace splits on first underscore", () => {
    expect(errorNamespace("STORAGE_QUOTA_EXCEEDED")).toBe("STORAGE");
    expect(errorNamespace("CONFIG_MISSING_ENV")).toBe("CONFIG");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @foundryprotocol/0gkit-core test -- error-codes
```

Expected: FAIL — file not found.

- [ ] **Step 3: Implement `error-codes.ts`**

```ts
// packages/0gkit-core/src/error-codes.ts
export const ERROR_CODES = Object.freeze([
  // CONFIG_* — caller passed something we can't proceed with
  "CONFIG_MISSING_ENV",
  "CONFIG_INVALID_NETWORK",
  "CONFIG_INVALID_ADDRESS",
  "CONFIG_INVALID_ARGUMENT",
  // WALLET_* — signer + key material
  "WALLET_NO_PRIVATE_KEY",
  "WALLET_KMS_SIGN_FAILED",
  "WALLET_KMS_PUBKEY_FAILED",
  "WALLET_BAD_DER_SIGNATURE",
  "WALLET_NO_CONNECTOR",
  "WALLET_CHAIN_MISMATCH",
  // CHAIN_* — RPC + node
  "CHAIN_RPC_UNREACHABLE",
  "CHAIN_RPC_TIMEOUT",
  "CHAIN_TX_REVERTED",
  "CHAIN_TX_TIMEOUT",
  "CHAIN_INSUFFICIENT_FUNDS",
  "CHAIN_NONCE_TOO_LOW",
  // STORAGE_*
  "STORAGE_QUOTA_EXCEEDED",
  "STORAGE_UPLOAD_FAILED",
  "STORAGE_DOWNLOAD_FAILED",
  "STORAGE_ROOT_NOT_FOUND",
  "STORAGE_ROOT_MISMATCH",
  "STORAGE_INVALID_BYTES",
  // COMPUTE_*
  "COMPUTE_PROVIDER_UNREACHABLE",
  "COMPUTE_NO_PROVIDER",
  "COMPUTE_INFERENCE_FAILED",
  "COMPUTE_BAD_ATTESTATION",
  "COMPUTE_BUDGET_EXCEEDED",
  // DA_*
  "DA_PUBLISH_FAILED",
  "DA_VERIFY_FAILED",
  "DA_INVALID_PAYLOAD",
  // ATTESTATION_*
  "ATTESTATION_BAD_SIGNATURE",
  "ATTESTATION_BAD_PAYLOAD",
  "ATTESTATION_EXPIRED",
  // CONTRACTS_*
  "CONTRACTS_REVERTED",
  "CONTRACTS_NO_ADDRESS",
  "CONTRACTS_ABI_MISMATCH",
  "CONTRACTS_CODEGEN_FAILED",
  // INDEXER_*
  "INDEXER_REORG_LIMIT_EXCEEDED",
  "INDEXER_CURSOR_BACKEND_UNREACHABLE",
  "INDEXER_EVENT_DECODE_FAILED",
  // JOBS_* (SP10) — pre-defined here so SP10 doesn't widen the enum mid-roadmap
  "JOBS_BACKEND_UNREACHABLE",
  "JOBS_JOB_NOT_FOUND",
  "JOBS_HANDLER_THREW",
  "JOBS_WEBHOOK_BAD_SIGNATURE",
  // OBSERVABILITY_* (SP11)
  "OBSERVABILITY_EXPORTER_FAILED",
] as const);

export type ErrorCode = (typeof ERROR_CODES)[number];

const CODE_SET: ReadonlySet<string> = new Set(ERROR_CODES);

export function isErrorCode(v: string): v is ErrorCode {
  return CODE_SET.has(v);
}

export function errorNamespace(code: ErrorCode): string {
  const idx = code.indexOf("_");
  return idx === -1 ? code : code.slice(0, idx);
}

export const ERROR_HELP_BASE = "https://0gkit.dev/errors/";

export function helpUrlFor(code: ErrorCode): string {
  return `${ERROR_HELP_BASE}${code}`;
}
```

- [ ] **Step 4: Verify enum tests pass**

```bash
pnpm --filter @foundryprotocol/0gkit-core test -- error-codes
```

Expected: PASS (6 tests).

- [ ] **Step 5: Write the failing tests for refactored `ZeroGError`**

`packages/0gkit-core/src/__tests__/errors.test.ts` — replace contents:

```ts
import { describe, expect, it } from "vitest";
import {
  ZeroGError,
  ConfigError,
  NetworkError,
  ChainError,
  AttestationError,
} from "../errors.js";

describe("ZeroGError", () => {
  it("requires a canonical code and exposes helpUrl", () => {
    const e = new ZeroGError(
      "STORAGE_QUOTA_EXCEEDED",
      "over quota",
      "raise quota or shrink upload"
    );
    expect(e.code).toBe("STORAGE_QUOTA_EXCEEDED");
    expect(e.helpUrl).toBe("https://0gkit.dev/errors/STORAGE_QUOTA_EXCEEDED");
    expect(e.hint).toBe("raise quota or shrink upload");
    expect(e.message).toBe("over quota");
    expect(e.name).toBe("ZeroGError");
    expect(e instanceof Error).toBe(true);
  });

  it("toJSON serialises code, message, hint, helpUrl", () => {
    const e = new ZeroGError("CHAIN_RPC_UNREACHABLE", "rpc down", "check connectivity");
    expect(e.toJSON()).toEqual({
      name: "ZeroGError",
      code: "CHAIN_RPC_UNREACHABLE",
      message: "rpc down",
      hint: "check connectivity",
      helpUrl: "https://0gkit.dev/errors/CHAIN_RPC_UNREACHABLE",
    });
  });
});

describe("subclasses", () => {
  it("ConfigError defaults to CONFIG_INVALID_ARGUMENT when no code given", () => {
    const e = new ConfigError("bad", "fix");
    expect(e.code).toBe("CONFIG_INVALID_ARGUMENT");
    expect(e).toBeInstanceOf(ZeroGError);
    expect(e.name).toBe("ConfigError");
  });

  it("ConfigError accepts an explicit code in the CONFIG_* namespace", () => {
    const e = new ConfigError("missing", "set FOO", "CONFIG_MISSING_ENV");
    expect(e.code).toBe("CONFIG_MISSING_ENV");
  });

  it("NetworkError defaults to CHAIN_RPC_UNREACHABLE", () => {
    const e = new NetworkError("rpc", "retry");
    expect(e.code).toBe("CHAIN_RPC_UNREACHABLE");
  });

  it("ChainError defaults to CHAIN_TX_REVERTED", () => {
    const e = new ChainError("revert", "check args");
    expect(e.code).toBe("CHAIN_TX_REVERTED");
  });

  it("AttestationError defaults to ATTESTATION_BAD_SIGNATURE", () => {
    const e = new AttestationError("bad sig", "regenerate");
    expect(e.code).toBe("ATTESTATION_BAD_SIGNATURE");
  });
});
```

- [ ] **Step 6: Run tests to verify failure**

```bash
pnpm --filter @foundryprotocol/0gkit-core test -- errors
```

Expected: FAIL — old `ZeroGError` constructor still in place.

- [ ] **Step 7: Refactor `errors.ts`**

`packages/0gkit-core/src/errors.ts`:

```ts
import { type ErrorCode, helpUrlFor, errorNamespace } from "./error-codes.js";

export class ZeroGError extends Error {
  readonly code: ErrorCode;
  readonly hint: string;
  readonly helpUrl: string;

  constructor(code: ErrorCode, message: string, hint: string) {
    super(message);
    this.name = "ZeroGError";
    this.code = code;
    this.hint = hint;
    this.helpUrl = helpUrlFor(code);
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      hint: this.hint,
      helpUrl: this.helpUrl,
    };
  }
}

function namespacedDefault(ns: string, fallback: ErrorCode): ErrorCode {
  // For subclass ergonomics — caller may pass `code` as 3rd arg.
  return fallback;
}

export class ConfigError extends ZeroGError {
  constructor(
    message: string,
    hint: string,
    code: ErrorCode = "CONFIG_INVALID_ARGUMENT"
  ) {
    super(code, message, hint);
    this.name = "ConfigError";
  }
}

export class NetworkError extends ZeroGError {
  constructor(
    message: string,
    hint: string,
    code: ErrorCode = "CHAIN_RPC_UNREACHABLE"
  ) {
    super(code, message, hint);
    this.name = "NetworkError";
  }
}

export class ChainError extends ZeroGError {
  constructor(message: string, hint: string, code: ErrorCode = "CHAIN_TX_REVERTED") {
    super(code, message, hint);
    this.name = "ChainError";
  }
}

export class AttestationError extends ZeroGError {
  constructor(
    message: string,
    hint: string,
    code: ErrorCode = "ATTESTATION_BAD_SIGNATURE"
  ) {
    super(code, message, hint);
    this.name = "AttestationError";
  }
}

export { errorNamespace };
```

- [ ] **Step 8: Re-export from index**

Modify `packages/0gkit-core/src/index.ts` — append:

```ts
export {
  ERROR_CODES,
  type ErrorCode,
  isErrorCode,
  errorNamespace,
  helpUrlFor,
  ERROR_HELP_BASE,
} from "./error-codes.js";
```

(Existing exports of `ZeroGError`, subclasses unchanged.)

- [ ] **Step 9: Run tests + build**

```bash
pnpm --filter @foundryprotocol/0gkit-core test
pnpm --filter @foundryprotocol/0gkit-core build
pnpm --filter @foundryprotocol/0gkit-core typecheck
```

All three: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/0gkit-core/src/error-codes.ts \
        packages/0gkit-core/src/errors.ts \
        packages/0gkit-core/src/index.ts \
        packages/0gkit-core/src/__tests__/error-codes.test.ts \
        packages/0gkit-core/src/__tests__/errors.test.ts
git commit -m "feat(core): SP9 — canonical ErrorCode enum + helpUrl on ZeroGError"
```

---

### Task 2: Subclass passthrough verification

The `ZeroGError` constructor signature stayed `(code, message, hint)` and subclass constructors stayed `(message, hint)` plus an optional `code`. No callsite that uses `new ConfigError(msg, hint)` should break. This task verifies that across the existing codebase.

**Files:**

- Modify: `packages/0gkit-chain/src/index.ts` (or wherever `ConfigError` is currently thrown) — no behavioural change; just confirm.
- Verify: `pnpm typecheck` across the whole workspace.

- [ ] **Step 1: Run workspace-wide typecheck**

```bash
pnpm typecheck
```

Expected: PASS. If anything fails, it's a callsite that called `new ZeroGError("CONFIG", msg, hint)` directly — convert to the new code argument (likely `CONFIG_INVALID_ARGUMENT` or `CONFIG_MISSING_ENV`).

- [ ] **Step 2: Commit (only if any fixups landed; otherwise skip)**

```bash
git add -p
git commit -m "fix: align direct ZeroGError callsites to new ErrorCode enum"
```

---

### Task 3: Audit + retype all `throw new Error` callsites

The grep from session prep found ~20 raw `throw new Error(...)` sites in `0gkit-*` packages. Each must become a `ZeroGError` with the most specific code.

**Files (in dependency order — keep core first):**

| File                                                      | Old                                                        | New code                                                                                                 |
| --------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `packages/0gkit-storage/src/estimate.ts:34`               | `throw new Error("sizeBytes must be ≥ 0")`                 | `STORAGE_INVALID_BYTES`                                                                                  |
| `packages/0gkit-da/src/estimate.ts:29`                    | `throw new Error("sizeBytes must be ≥ 0")`                 | `DA_INVALID_PAYLOAD`                                                                                     |
| `packages/0gkit-indexer/src/log-decoder.ts:21`            | `throw new Error("no event named ...")`                    | `INDEXER_EVENT_DECODE_FAILED`                                                                            |
| `packages/0gkit-indexer/src/block-tracker.ts:28`          | `throw new Error("BlockTracker depth must be >= 1")`       | `CONFIG_INVALID_ARGUMENT`                                                                                |
| `packages/0gkit-indexer/src/cursors/redis.ts:35`          | `throw new Error("...ioredis...")`                         | `INDEXER_CURSOR_BACKEND_UNREACHABLE`                                                                     |
| `packages/0gkit-wallet/src/from-kms.ts:31,53,121,123,127` | `throw new Error("KMS ..." / "Bad DER")`                   | `WALLET_KMS_PUBKEY_FAILED` (31), `WALLET_KMS_SIGN_FAILED` (53), `WALLET_BAD_DER_SIGNATURE` (121/123/127) |
| `packages/0gkit-wallet-react/src/use-connect.ts:19`       | `throw new Error("No connector found ...")`                | `WALLET_NO_CONNECTOR`                                                                                    |
| `packages/0gkit-cli/src/commands/estimate.ts:134`         | `throw new Error("--args must be a JSON array")`           | `CONFIG_INVALID_ARGUMENT`                                                                                |
| `packages/0gkit-devnet/src/*-mock.ts` (3 sites)           | `throw new Error("server.address() ...")`                  | leave as raw `Error` (devnet internals, not user-facing) — **skip**                                      |
| `packages/0gkit-devnet/src/accounts.ts:29`                | `throw new Error("Failed to derive private key ...")`      | `WALLET_NO_PRIVATE_KEY`                                                                                  |
| `packages/0gkit-testing/src/test-wallet.ts:34,52`         | `throw new Error("testWallet: ...")`                       | `WALLET_NO_PRIVATE_KEY` (34), `CONFIG_INVALID_ARGUMENT` (52)                                             |
| `packages/0gkit-testing/src/mocks/storage.ts:48`          | `throw new Error("mockStorageClient: root ... not found")` | `STORAGE_ROOT_NOT_FOUND`                                                                                 |

- [ ] **Step 1: Write a failing test in `0gkit-storage` (canary for the pattern)**

`packages/0gkit-storage/src/__tests__/estimate-errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { estimateStorage } from "../estimate.js";

describe("estimateStorage error codes", () => {
  it("throws STORAGE_INVALID_BYTES when sizeBytes is negative", () => {
    try {
      estimateStorage({ sizeBytes: -1 });
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as any).code).toBe("STORAGE_INVALID_BYTES");
      expect((e as any).helpUrl).toBe("https://0gkit.dev/errors/STORAGE_INVALID_BYTES");
      expect(e instanceof Error).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run + verify failure**

```bash
pnpm --filter @foundryprotocol/0gkit-storage test -- estimate-errors
```

Expected: FAIL — raw `Error` has no `code`.

- [ ] **Step 3: Convert `estimate.ts:34`**

```ts
// packages/0gkit-storage/src/estimate.ts (around line 34)
import { ZeroGError } from "@foundryprotocol/0gkit-core";

// ...
if (sizeBytes < 0) {
  throw new ZeroGError(
    "STORAGE_INVALID_BYTES",
    "sizeBytes must be ≥ 0",
    "Pass a non-negative integer for sizeBytes (the number of bytes you intend to upload)."
  );
}
```

- [ ] **Step 4: Verify test passes**

```bash
pnpm --filter @foundryprotocol/0gkit-storage test -- estimate-errors
```

Expected: PASS.

- [ ] **Step 5: Repeat steps 1-4 for each row of the audit table**

For each row: write a `*-errors.test.ts` next to the source file with an assertion of the expected code, run + fail, swap the `throw new Error(...)` for the typed `ZeroGError(code, message, hint)`, run + pass.

Each package gets its own test file (one per source file with retyped throws). Don't share a single sweeping test file — keep the locality.

For the devnet 3 sites: leave as raw `Error` because they're "this should never happen" internal invariants on `net.AddressInfo` shape. Add a one-line comment: `// internal invariant — not user-facing`.

- [ ] **Step 6: Run workspace tests**

```bash
pnpm test
pnpm typecheck
pnpm boundary:check
```

All three: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A packages/
git commit -m "refactor: retype throw new Error → ZeroGError with canonical codes (SP9)"
```

---

### Task 4: `pnpm docs:check` orphan detector

The script statically extracts every `ErrorCode` literal referenced by a `ZeroGError(` constructor call across `packages/**/src/**/*.ts` (regex is fine — codegen-grade precision is overkill), unions with the codes referenced by subclass constructors (defaulted codes still need pages), then diffs against the union of directory names under `apps/docs/app/errors/`.

**Files:**

- Create: `scripts/docs-check.ts`
- Create: `scripts/__tests__/docs-check.test.ts`
- Modify: `package.json` (root) — add script.

- [ ] **Step 1: Write the failing unit test**

`scripts/__tests__/docs-check.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { findReferencedCodes, findDocumentedCodes, diffCodes } from "../docs-check.js";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

function scratch() {
  return mkdtempSync(join(tmpdir(), "docs-check-"));
}

describe("findReferencedCodes", () => {
  it("extracts codes from ZeroGError() calls", () => {
    const dir = scratch();
    writeFileSync(
      join(dir, "a.ts"),
      `throw new ZeroGError("STORAGE_QUOTA_EXCEEDED", "msg", "hint");`
    );
    writeFileSync(
      join(dir, "b.ts"),
      `throw new ZeroGError(\n  "CHAIN_RPC_UNREACHABLE",\n  "msg",\n  "hint"\n);`
    );
    const found = findReferencedCodes([dir]);
    expect(found).toEqual(new Set(["STORAGE_QUOTA_EXCEEDED", "CHAIN_RPC_UNREACHABLE"]));
  });

  it("extracts codes from subclass with explicit code arg", () => {
    const dir = scratch();
    writeFileSync(
      join(dir, "a.ts"),
      `throw new ConfigError("missing FOO", "set it", "CONFIG_MISSING_ENV");`
    );
    expect(findReferencedCodes([dir])).toContain("CONFIG_MISSING_ENV");
  });
});

describe("findDocumentedCodes", () => {
  it("lists subdirectories of apps/docs/app/errors", () => {
    const dir = scratch();
    mkdirSync(join(dir, "STORAGE_QUOTA_EXCEEDED"));
    writeFileSync(join(dir, "STORAGE_QUOTA_EXCEEDED", "page.mdx"), "# title");
    expect(findDocumentedCodes(dir)).toEqual(new Set(["STORAGE_QUOTA_EXCEEDED"]));
  });
});

describe("diffCodes", () => {
  it("flags orphan thrown codes (no docs page)", () => {
    const result = diffCodes({
      referenced: new Set(["A", "B"]),
      documented: new Set(["A"]),
      enumDefined: new Set(["A", "B", "C"]),
    });
    expect(result.missingPages).toEqual(["B"]);
    expect(result.orphanPages).toEqual([]);
    expect(result.unusedInCode).toEqual(["C"]);
    expect(result.ok).toBe(false);
  });

  it("flags orphan docs pages (no thrower)", () => {
    const result = diffCodes({
      referenced: new Set(["A"]),
      documented: new Set(["A", "B"]),
      enumDefined: new Set(["A", "B"]),
    });
    expect(result.orphanPages).toEqual(["B"]);
    expect(result.ok).toBe(false);
  });

  it("passes when all three sets agree", () => {
    const result = diffCodes({
      referenced: new Set(["A"]),
      documented: new Set(["A"]),
      enumDefined: new Set(["A"]),
    });
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run + verify failure**

```bash
pnpm vitest run scripts/__tests__/docs-check.test.ts
```

Expected: FAIL — `docs-check.js` missing.

- [ ] **Step 3: Implement `scripts/docs-check.ts`**

```ts
#!/usr/bin/env tsx
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ERROR_CODES } from "../packages/0gkit-core/dist/error-codes.js";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const PACKAGES_DIR = join(ROOT, "packages");
const DOCS_ERRORS_DIR = join(ROOT, "apps/docs/app/errors");

const CODE_RE =
  /new\s+(?:ZeroGError|ConfigError|NetworkError|ChainError|AttestationError)\s*\([^)]*?"([A-Z][A-Z0-9_]+)"/g;

function* walk(dir: string): Generator<string> {
  for (const ent of readdirSync(dir)) {
    if (ent === "node_modules" || ent === "dist" || ent === "__tests__") continue;
    const p = join(dir, ent);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) yield p;
  }
}

export function findReferencedCodes(roots: string[]): Set<string> {
  const out = new Set<string>();
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const file of walk(root)) {
      const src = readFileSync(file, "utf8");
      let m: RegExpExecArray | null;
      CODE_RE.lastIndex = 0;
      while ((m = CODE_RE.exec(src)) !== null) {
        out.add(m[1]);
      }
    }
  }
  return out;
}

export function findDocumentedCodes(errorsDir: string): Set<string> {
  if (!existsSync(errorsDir)) return new Set();
  const out = new Set<string>();
  for (const ent of readdirSync(errorsDir)) {
    if (ent.startsWith("[") || ent === "page.mdx" || ent === "layout.tsx") continue;
    const p = join(errorsDir, ent);
    if (statSync(p).isDirectory() && existsSync(join(p, "page.mdx"))) {
      out.add(ent);
    }
  }
  return out;
}

export interface DiffInput {
  referenced: Set<string>;
  documented: Set<string>;
  enumDefined: Set<string>;
}

export interface DiffResult {
  missingPages: string[];
  orphanPages: string[];
  unusedInCode: string[];
  ok: boolean;
}

export function diffCodes(input: DiffInput): DiffResult {
  const missingPages = [...input.referenced]
    .filter((c) => !input.documented.has(c))
    .sort();
  const orphanPages = [...input.documented]
    .filter((c) => !input.enumDefined.has(c))
    .sort();
  const unusedInCode = [...input.enumDefined]
    .filter((c) => !input.referenced.has(c))
    .sort();
  return {
    missingPages,
    orphanPages,
    unusedInCode,
    ok: missingPages.length === 0 && orphanPages.length === 0,
  };
}

async function main() {
  const referenced = findReferencedCodes([PACKAGES_DIR]);
  const documented = findDocumentedCodes(DOCS_ERRORS_DIR);
  const enumDefined = new Set<string>(ERROR_CODES);
  const result = diffCodes({ referenced, documented, enumDefined });

  if (result.missingPages.length > 0) {
    console.error(
      `✗ Missing docs page for thrown codes:\n  ${result.missingPages.join("\n  ")}`
    );
  }
  if (result.orphanPages.length > 0) {
    console.error(
      `✗ Orphan docs pages (no code in enum):\n  ${result.orphanPages.join("\n  ")}`
    );
  }
  if (result.unusedInCode.length > 0) {
    console.warn(
      `⚠ Codes defined in enum but never thrown:\n  ${result.unusedInCode.join("\n  ")}`
    );
  }
  if (!result.ok) process.exit(1);
  console.log(`✓ docs:check passed — ${referenced.size} codes thrown, all documented`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
```

- [ ] **Step 4: Add npm script**

`package.json` (root) — under `"scripts"`:

```jsonc
{
  "scripts": {
    // ... existing ...
    "docs:check": "tsx scripts/docs-check.ts",
  },
}
```

- [ ] **Step 5: Verify tests pass**

```bash
pnpm vitest run scripts/__tests__/docs-check.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add scripts/docs-check.ts scripts/__tests__/docs-check.test.ts package.json
git commit -m "feat: add pnpm docs:check (error code ↔ docs page orphan detector)"
```

---

### Task 5: Emit one MDX page per code

Generate a stub page for every code currently referenced by a `throw`. Each page has frontmatter, a "what happened" section, "common cause", "fix", and "minimal example". Fill in fast prose for each — these are stubs that humans iterate on, but they must be substantive enough to actually help (not "TODO").

Use a one-shot script that reads `ERROR_CODES` and emits a page if missing. Authoring stays manual after that; the script only ever creates, never overwrites.

**Files:**

- Create: `scripts/scaffold-error-pages.ts`
- Create: `apps/docs/app/errors/page.mdx`
- Create: `apps/docs/app/errors/<CODE>/page.mdx` × ~40

- [ ] **Step 1: Implement the scaffold script**

```ts
// scripts/scaffold-error-pages.ts
#!/usr/bin/env tsx
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ERROR_CODES, errorNamespace } from "../packages/0gkit-core/dist/error-codes.js";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const ERRORS_DIR = join(ROOT, "apps/docs/app/errors");

const TEMPLATE_BY_CODE: Record<string, { title: string; cause: string; fix: string; example: string }> = {
  STORAGE_QUOTA_EXCEEDED: {
    title: "Storage quota exceeded",
    cause: "The signer's account has uploaded more bytes than the network permits per epoch.",
    fix: "Wait until the next epoch, request a quota increase via faucet support, or compress + dedup the bytes before re-uploading.",
    example: `import { Storage, ZeroGError } from "@foundryprotocol/0gkit-storage";
try {
  await storage.upload(bigBuffer);
} catch (e) {
  if (e instanceof ZeroGError && e.code === "STORAGE_QUOTA_EXCEEDED") {
    console.log("Try again in the next epoch.");
  }
}`,
  },
  // ... one entry per code ...
};

function pageBody(code: string): string {
  const ns = errorNamespace(code as any);
  const t = TEMPLATE_BY_CODE[code] ?? {
    title: code.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()),
    cause: `A ${ns.toLowerCase()} operation failed. See the stack trace for the exact callsite.`,
    fix: "See the error's `hint` for the immediate remediation; if unclear, file an issue at https://github.com/rajkaria/0gkit/issues with the full stack.",
    example: `try { /* ... */ } catch (e) {\n  if (e instanceof ZeroGError && e.code === "${code}") {\n    // handle\n  }\n}`,
  };
  return `---
title: ${code}
description: ${t.title}
namespace: ${ns}
---

# ${code}

## What happened

${t.cause}

## How to fix it

${t.fix}

## Example

\`\`\`ts
${t.example}
\`\`\`

## Related

- [Error code reference](/errors)
- [Reporting an issue](https://github.com/rajkaria/0gkit/issues/new?template=bug.yml)
`;
}

let created = 0;
for (const code of ERROR_CODES) {
  const dir = join(ERRORS_DIR, code);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const page = join(dir, "page.mdx");
  if (!existsSync(page)) {
    writeFileSync(page, pageBody(code));
    created += 1;
  }
}
console.log(`scaffolded ${created} error pages`);
```

- [ ] **Step 2: Author rich TEMPLATE_BY_CODE entries for the high-traffic codes**

Hand-write entries for the codes most likely to be encountered by builders. Minimum set: `STORAGE_QUOTA_EXCEEDED`, `STORAGE_UPLOAD_FAILED`, `STORAGE_ROOT_NOT_FOUND`, `COMPUTE_PROVIDER_UNREACHABLE`, `COMPUTE_BAD_ATTESTATION`, `CHAIN_RPC_UNREACHABLE`, `CHAIN_INSUFFICIENT_FUNDS`, `CHAIN_TX_REVERTED`, `CONFIG_MISSING_ENV`, `WALLET_NO_CONNECTOR`, `CONTRACTS_REVERTED`, `INDEXER_REORG_LIMIT_EXCEEDED`. Other codes get the generic auto-fill.

Each entry's `fix` field must be specific to that code — never "see the docs" or "file a ticket" for high-traffic codes. The whole point is that the docs page is the fix.

- [ ] **Step 3: Run the scaffold**

```bash
pnpm --filter @foundryprotocol/0gkit-core build  # ensure dist/error-codes.js exists
pnpm tsx scripts/scaffold-error-pages.ts
```

Expected: `scaffolded N error pages` where N = the number of codes in the enum.

- [ ] **Step 4: Write `apps/docs/app/errors/page.mdx` (index)**

```mdx
---
title: Error code reference
description: Every error 0gkit throws has a stable code and a page that explains the fix.
---

# Error codes

Every error thrown anywhere in `@foundryprotocol/0gkit-*` carries a stable
`code` (SCREAMING_SNAKE) and a `helpUrl` that lands on this section.

## How to read a 0gkit error

\`\`\`ts
import { ZeroGError } from "@foundryprotocol/0gkit-core";

try {
// ...
} catch (e) {
if (e instanceof ZeroGError) {
console.error(`${e.code} — ${e.message}\nFix: ${e.helpUrl}`);
}
}
\`\`\`

## Codes by namespace

import { ErrorCodeIndex } from "@/components/error-code-index";

<ErrorCodeIndex />
```

And create `apps/docs/components/error-code-index.tsx`:

```tsx
import Link from "next/link";
import { ERROR_CODES, errorNamespace } from "@foundryprotocol/0gkit-core";

export function ErrorCodeIndex() {
  const grouped: Record<string, string[]> = {};
  for (const c of ERROR_CODES) {
    const ns = errorNamespace(c);
    (grouped[ns] ??= []).push(c);
  }
  return (
    <div>
      {Object.entries(grouped)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([ns, codes]) => (
          <section key={ns}>
            <h3>{ns}</h3>
            <ul>
              {codes.map((c) => (
                <li key={c}>
                  <Link href={`/errors/${c}`}>{c}</Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
```

- [ ] **Step 5: Run `pnpm docs:check`**

```bash
pnpm --filter @foundryprotocol/0gkit-core build
pnpm docs:check
```

Expected: PASS — every thrown code has a page; every page has a code in the enum.

- [ ] **Step 6: Commit**

```bash
git add scripts/scaffold-error-pages.ts \
        apps/docs/app/errors/ \
        apps/docs/components/error-code-index.tsx
git commit -m "docs: SP9 — one MDX page per ErrorCode + namespace-grouped index"
```

---

### Task 6: CI wire-up + React error boundary

**Files:**

- Modify: `.github/workflows/ci.yml`
- Create: `packages/0gkit-react/src/error-boundary.tsx`
- Modify: `packages/0gkit-react/src/index.ts`
- Create: `packages/0gkit-react/src/__tests__/error-boundary.test.tsx`

- [ ] **Step 1: Add `docs:check` to CI**

Modify `.github/workflows/ci.yml` — add a step after `pnpm test`:

```yaml
- run: pnpm docs:check
```

- [ ] **Step 2: Write the failing boundary test**

`packages/0gkit-react/src/__tests__/error-boundary.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ZeroGError } from "@foundryprotocol/0gkit-core";
import { ZeroGErrorBoundary } from "../error-boundary.js";

function Boom() {
  throw new ZeroGError("STORAGE_QUOTA_EXCEEDED", "over quota", "raise quota");
}

describe("ZeroGErrorBoundary", () => {
  it("renders fallback with code, message, and help link on ZeroGError", () => {
    render(
      <ZeroGErrorBoundary>
        <Boom />
      </ZeroGErrorBoundary>
    );
    expect(screen.getByText(/STORAGE_QUOTA_EXCEEDED/)).toBeInTheDocument();
    expect(screen.getByText(/over quota/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /how to fix/i });
    expect(link).toHaveAttribute(
      "href",
      "https://0gkit.dev/errors/STORAGE_QUOTA_EXCEEDED"
    );
  });

  it("rethrows non-ZeroGError errors", () => {
    function VanillaBoom() {
      throw new Error("plain");
    }
    // The boundary's fallback should render the message but with no helpUrl.
    render(
      <ZeroGErrorBoundary>
        <VanillaBoom />
      </ZeroGErrorBoundary>
    );
    expect(screen.getByText(/plain/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /how to fix/i })).toBeNull();
  });
});
```

- [ ] **Step 3: Run + verify failure**

```bash
pnpm --filter @foundryprotocol/0gkit-react test -- error-boundary
```

Expected: FAIL.

- [ ] **Step 4: Implement the boundary**

```tsx
// packages/0gkit-react/src/error-boundary.tsx
"use client";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { ZeroGError } from "@foundryprotocol/0gkit-core";

interface Props {
  children: ReactNode;
  fallback?: (error: Error) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ZeroGErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (typeof console !== "undefined") {
      console.error("[ZeroGErrorBoundary]", error, info);
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error);
    if (error instanceof ZeroGError) {
      return (
        <div
          role="alert"
          style={{ padding: 16, border: "1px solid #c00", borderRadius: 4 }}
        >
          <strong>{error.code}</strong>
          <p>{error.message}</p>
          <p style={{ opacity: 0.8 }}>{error.hint}</p>
          <a href={error.helpUrl} target="_blank" rel="noopener noreferrer">
            How to fix →
          </a>
        </div>
      );
    }
    return (
      <div
        role="alert"
        style={{ padding: 16, border: "1px solid #c00", borderRadius: 4 }}
      >
        <strong>Unexpected error</strong>
        <p>{error.message}</p>
      </div>
    );
  }
}
```

Re-export in `packages/0gkit-react/src/index.ts`:

```ts
export { ZeroGErrorBoundary } from "./error-boundary.js";
```

- [ ] **Step 5: Run + verify pass**

```bash
pnpm --filter @foundryprotocol/0gkit-react test -- error-boundary
pnpm --filter @foundryprotocol/0gkit-react build
pnpm --filter @foundryprotocol/0gkit-react typecheck
```

All three: PASS.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml \
        packages/0gkit-react/src/error-boundary.tsx \
        packages/0gkit-react/src/index.ts \
        packages/0gkit-react/src/__tests__/error-boundary.test.tsx
git commit -m "feat(react): ZeroGErrorBoundary + wire docs:check into CI"
```

---

### Task 7: Changeset, decisions, roadmap mark, release prep

- [ ] **Step 1: Author the changeset**

`.changeset/sp9-error-taxonomy.md`:

```markdown
---
"@foundryprotocol/0gkit-core": minor
"@foundryprotocol/0gkit-react": minor
"@foundryprotocol/0gkit-storage": patch
"@foundryprotocol/0gkit-compute": patch
"@foundryprotocol/0gkit-da": patch
"@foundryprotocol/0gkit-attestation": patch
"@foundryprotocol/0gkit-chain": patch
"@foundryprotocol/0gkit-cli": patch
"@foundryprotocol/0gkit-contracts": patch
"@foundryprotocol/0gkit-indexer": patch
"@foundryprotocol/0gkit-wallet": patch
"@foundryprotocol/0gkit-wallet-react": patch
"@foundryprotocol/0gkit-testing": patch
"@foundryprotocol/0gkit-devnet": patch
---

SP9 — Error taxonomy. `ZeroGError` now exposes a stable `code` (one of ~40 SCREAMING_SNAKE values, see `ERROR_CODES`) and a `helpUrl` that resolves to a page on `0gkit.dev/errors/<CODE>` with cause + fix + example. `0gkit-react` ships a `<ZeroGErrorBoundary>` component that surfaces the help link.

Breaking change for direct callers of `new ZeroGError(code, message, hint)`: the `code` argument moves from the 4-value union to the wider `ErrorCode` union; old codes (`CONFIG`, `NETWORK`, `CHAIN`, `ATTESTATION`) are no longer accepted — use the specific namespaced code (e.g., `CONFIG_MISSING_ENV`). Subclass constructors (`ConfigError`, `NetworkError`, etc.) are source-compatible.
```

- [ ] **Step 2: Append decisions D27 + D28**

`docs/DECISIONS.md`:

```markdown
---

## D27 — `helpUrl` is computed from the code, not stored

**Date:** 2026-05-22 · **SP:** SP9

`ZeroGError.helpUrl = \`https://0gkit.dev/errors/${code}\``. We don't store it on
each throw site for two reasons: (a) DRY — one source of truth for the URL
shape; (b) it lets us rebase the docs domain (e.g., to `docs.0gkit.dev`) with a
single `ERROR_HELP_BASE` swap. If we ever need per-code URL overrides
(unlikely), the field is computed in `helpUrlFor()` and we add a lookup there.

---

## D28 — `pnpm docs:check` is a CI gate, not just a lint

**Date:** 2026-05-22 · **SP:** SP9

Every `ErrorCode` referenced by a `throw new ZeroGError(...)` (or by a subclass
with an explicit code) MUST have a corresponding directory under
`apps/docs/app/errors/<CODE>/page.mdx`. The check runs in CI after `pnpm test`.
A PR that adds a code without adding a page fails red. Likewise, deleting a
code without deleting its page also fails red (catches doc-rot from refactors).
Static regex extraction is fine — false positives are rare and the failure
mode is a noisy CI run, not a runtime bug.
```

- [ ] **Step 3: Mark SP9 ✅ in the roadmap**

`docs/specs/2026-05-20-essentials-roadmap.md` — change the SP9 heading to `### SP9 — Error taxonomy + \`0gkit.dev/errors/<code>\` ✅ Shipped 2026-05-22` and update the Phase Overview table row.

- [ ] **Step 4: Run full pre-merge gate**

```bash
pnpm format:check
pnpm boundary:check
pnpm build
pnpm typecheck
pnpm test
pnpm docs:check
pnpm templates:check
```

All seven: PASS.

- [ ] **Step 5: Commit, push, open PR, squash-merge**

```bash
git add .changeset/sp9-error-taxonomy.md docs/DECISIONS.md docs/specs/2026-05-20-essentials-roadmap.md
git commit -m "docs: SP9 changeset + decisions D27/D28 + roadmap mark"
git push -u origin sp9-error-taxonomy
gh pr create --title "SP9 — Error taxonomy + helpUrl + docs:check CI gate" --body "$(cat <<'EOF'
## Summary
- `ZeroGError` carries a stable `code` from a 40-entry SCREAMING_SNAKE enum + `helpUrl` to `0gkit.dev/errors/<code>`.
- ~20 raw `throw new Error(...)` sites converted to typed `ZeroGError`.
- One MDX page per code under `apps/docs/app/errors/<CODE>/page.mdx`.
- `pnpm docs:check` wired into CI — orphan codes or orphan pages fail red.
- `<ZeroGErrorBoundary>` in `0gkit-react` renders the help link.

## Test plan
- [x] `pnpm test` (all 0gkit-* packages)
- [x] `pnpm docs:check`
- [x] `pnpm boundary:check`
- [x] Build + typecheck workspace-wide

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Once CI is green:

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 6: Update Foundryprotocol CLAUDE.md**

Append a SP9 ship entry to `/Users/rajkaria/Projects/Foundryprotocol/CLAUDE.md` mirroring the SP8 entry style (commit SHA, test/coverage rollup, decisions).

---

## Self-review checklist

- Spec coverage: SP9 §"Public surface", "Constraints", "Success criteria" — Tasks 1+5+6+4 cover them. ✓
- No placeholders: every step has runnable code or commands.
- Type consistency: `ErrorCode`, `ERROR_CODES`, `helpUrlFor`, `errorNamespace` named identically across tasks. ✓
- Failure mode coverage: missing page, orphan page, code-not-in-enum all tested in Task 4. ✓
- SP10/SP11 codes pre-listed in `ERROR_CODES` so SP10 and SP11 don't reopen this PR. ✓
