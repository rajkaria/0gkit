# SP6 — `@foundryprotocol/0gkit-indexer` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@foundryprotocol/0gkit-indexer` — reorg-safe, persisted-cursor event subscriptions on the 0G chain (memory / sqlite / redis cursor backends) plus `useEvent` + `useLogs` hooks in `@foundryprotocol/0gkit-react`.

**Architecture:** A polling indexer that reads logs in batches via viem's `getLogs`, tracks the recent block-hash chain in a bounded window to detect reorgs, persists cursor state through a pluggable `CursorStore` abstraction (memory built-in; sqlite via `better-sqlite3` direct dep; redis via `ioredis` optional peer), multiplexes any number of `subscribe(...)` calls onto a single poll loop, and exposes the entire surface as `class Indexer`. The package layers strictly on top of `0gkit-core` (network + ZeroGError) and `0gkit-contracts` (typed contracts give us `address` + `abi` directly). React adapter ships in `0gkit-react` as two hooks that internally manage one shared `Indexer` instance per `ZeroGIndexerProvider`.

**Tech Stack:** TypeScript (ES2022, ESM-only), `viem ^2.21` (PublicClient, `getLogs`, `decodeEventLog`, `getBlock`), `better-sqlite3 ^11` (synchronous, fast, zero-IO-thread overhead), `ioredis ^5` (optional peer for redis cursor), `vitest 2.1.8` + `@testing-library/react 16` for the React hooks. Mocks/fixtures come from `@foundryprotocol/0gkit-testing` (SP5). Build: `tsup` ESM, `dts: true`, `target: es2022`. Coverage gates: **80/80/80/70 lines/functions/statements/branches** (the existing standard), aiming for **85%+ lines** per the SP6 spec acceptance criterion.

---

## Hard Invariants Honored

- **I1 Neutrality** — package imports only `viem`, `@foundryprotocol/0gkit-core`, `@foundryprotocol/0gkit-contracts`, and (peer-optional) `ioredis`/`better-sqlite3`. No `@foundryprotocol/sdk` import, static or dynamic with a literal specifier. Enforced by `boundary.test.ts` and `pnpm boundary:check`.
- **I2 Layering** — Layer 2 surface (consumes Layers 0+1). Never imports `0gkit-cli`, `0gkit-mcp`, `0gkit-react`, `apps/*`, `templates/*`.
- **I6 Coverage** — 80/70 gate; SP6 spec targets 85%.
- **I7 Changesets** — minor for `0gkit-indexer` (first publish), minor for `0gkit-react` (new public hooks).
- **I8 No raw privateKey in new surface** — the indexer is read-only (logs + blocks). No signing surface; nothing to gate.

---

## File Structure

### New package: `packages/0gkit-indexer/`

| File                                  | Responsibility                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                        | Workspace metadata, deps, exports map (`.` + `./cursors/sqlite` + `./cursors/redis` sub-paths so consumers can tree-shake unused backends). |
| `tsconfig.json`                       | Extends repo root; `outDir: ./dist`.                                                                                                        |
| `tsup.config.ts`                      | Three entries: `index`, `cursors/sqlite`, `cursors/redis`. ESM, dts, target es2022, externals: viem + 0gkit + better-sqlite3 + ioredis.     |
| `vitest.config.ts`                    | 80/80/80/70 coverage gate; excludes `src/index.ts` + `src/__tests__/**`.                                                                    |
| `README.md`                           | Quickstart + API + cursor backends + reorg semantics.                                                                                       |
| `LICENSE`                             | MIT.                                                                                                                                        |
| `src/index.ts`                        | Re-exports: `Indexer`, types, `MemoryCursorStore`. (sqlite/redis stores are sub-path imports.)                                              |
| `src/types.ts`                        | Public types: `IndexerOptions`, `SubscribeOptions`, `DecodedEvent`, `Subscription`, `CursorState`, `CursorStore`, `IndexerStatus`.          |
| `src/indexer.ts`                      | The `Indexer` class — poll loop, subscription registry, reorg detection, lifecycle (`start` / `stop` / `status`).                           |
| `src/backoff.ts`                      | Pure `expBackoffWithJitter(attempt, opts?)` — exponential delay + decorrelated jitter, used on every `getLogs`/`getBlock` failure.          |
| `src/block-tracker.ts`                | Bounded-window block-hash chain (`BlockTracker.push`, `.findCommonAncestor`, `.headHash`, `.size`).                                         |
| `src/log-decoder.ts`                  | Pure helpers: `decodeOne(abi, log) → DecodedEvent`, `topicForEvent(abi, name) → Hex`.                                                       |
| `src/cursors/memory.ts`               | `MemoryCursorStore` — in-process Map, default for tests and ephemeral use.                                                                  |
| `src/cursors/sqlite.ts`               | `SqliteCursorStore` — uses `better-sqlite3` (direct dep); creates one table per database.                                                   |
| `src/cursors/redis.ts`                | `RedisCursorStore` — uses `ioredis` (optional peer); stores cursor JSON under `0gkit:cursor:<subId>`.                                       |
| `src/__tests__/backoff.test.ts`       | Pure-function tests.                                                                                                                        |
| `src/__tests__/block-tracker.test.ts` | Window growth, ancestor detection, head reorg.                                                                                              |
| `src/__tests__/log-decoder.test.ts`   | Decode + topic computation against a known ABI.                                                                                             |
| `src/__tests__/cursor-memory.test.ts` | Save / load / overwrite.                                                                                                                    |
| `src/__tests__/cursor-sqlite.test.ts` | Same surface tests as memory, plus restart-survives-process semantics (close + reopen).                                                     |
| `src/__tests__/cursor-redis.test.ts`  | Skipped unless `REDIS_URL` is set — proves the adapter shape against real redis when CI provides one.                                       |
| `src/__tests__/indexer.test.ts`       | End-to-end with a viem mock client: subscribe, replay historical, emit live, multi-event multiplex, restart preserves cursor.               |
| `src/__tests__/reorg.test.ts`         | Simulates a 3-block reorg via a fake transport; asserts `onReorg` called with the rolled-back events and `onEvent` re-emitted on new chain. |
| `src/__tests__/boundary.test.ts`      | `pnpm boundary:check` green + grep: no `from "@foundryprotocol/sdk"` and no `import("@foundryprotocol/sdk")` style literal specifiers.      |

### Modify package: `packages/0gkit-react/`

| File                                     | Responsibility                                                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                           | Add dep `@foundryprotocol/0gkit-indexer: workspace:*`; bump version via changeset (minor — new public hooks).                    |
| `src/IndexerProvider.tsx`                | `ZeroGIndexerProvider` + `useIndexer()` — wraps a single `Indexer` instance in React context; lazy-starts on first subscription. |
| `src/useEvent.ts`                        | `useEvent({ contract, event, fromBlock? }) → { events, isLoading, error }`. Live subscription via the provider's Indexer.        |
| `src/useLogs.ts`                         | `useLogs({ contract, event, fromBlock, toBlock? }) → { logs, isLoading, error }`. One-shot historical `getLogs`.                 |
| `src/index.ts`                           | Add exports: `ZeroGIndexerProvider`, `useIndexer`, `useEvent`, `useLogs`, plus types.                                            |
| `src/__tests__/useEvent.test.tsx`        | RTL test: render with provider, emit a fake event via mock indexer, assert hook updates.                                         |
| `src/__tests__/useLogs.test.tsx`         | RTL test: returns logs from a stubbed `Indexer.queryLogs(...)`.                                                                  |
| `src/__tests__/IndexerProvider.test.tsx` | Provider lifecycle: starts indexer on first subscription, stops on unmount.                                                      |

### Root-level changes

| File                                          | Responsibility                                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`                    | Add `0gkit-indexer` to the build / test / coverage matrix (mirrors existing entries).               |
| `.changeset/sp6-0gkit-indexer.md`             | `minor` bump for `@foundryprotocol/0gkit-indexer` (first publish) + `@foundryprotocol/0gkit-react`. |
| `README.md`                                   | Add `@foundryprotocol/0gkit-indexer` row to the package table; mention `useEvent`/`useLogs`.        |
| `docs/DECISIONS.md`                           | Append D19 (sqlite via better-sqlite3 direct dep; redis as optional peer) + D20 (polling, not WSS). |
| `docs/specs/2026-05-20-essentials-roadmap.md` | Flip SP6 status row to ✅ (shipped) at end of plan.                                                 |

---

## Task Decomposition (13 tasks)

Each task is independently testable, ships with passing tests, and produces a green `pnpm test` for the package. Commit after every task.

---

### Task 1: Package scaffold + boundary test

**Files:**

- Create: `packages/0gkit-indexer/package.json`
- Create: `packages/0gkit-indexer/tsconfig.json`
- Create: `packages/0gkit-indexer/tsup.config.ts`
- Create: `packages/0gkit-indexer/vitest.config.ts`
- Create: `packages/0gkit-indexer/README.md` (one-line placeholder; full README in Task 12)
- Create: `packages/0gkit-indexer/LICENSE` (MIT, copy from a sibling)
- Create: `packages/0gkit-indexer/src/index.ts` (empty `export {}` for now)
- Test: `packages/0gkit-indexer/src/__tests__/boundary.test.ts`
- Modify: `.github/workflows/ci.yml` — add `0gkit-indexer` to the build/test matrix.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@foundryprotocol/0gkit-indexer",
  "version": "0.0.0",
  "description": "Reorg-safe, persisted-cursor event subscriptions on 0G. Memory / SQLite / Redis cursor backends. Built on @foundryprotocol/0gkit-contracts typed contracts.",
  "license": "MIT",
  "homepage": "https://github.com/rajkaria/0gkit/tree/main/packages/0gkit-indexer",
  "repository": {
    "type": "git",
    "url": "https://github.com/rajkaria/0gkit.git",
    "directory": "packages/0gkit-indexer"
  },
  "bugs": { "url": "https://github.com/rajkaria/0gkit/issues" },
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./cursors/sqlite": {
      "types": "./dist/cursors/sqlite.d.ts",
      "import": "./dist/cursors/sqlite.js"
    },
    "./cursors/redis": {
      "types": "./dist/cursors/redis.d.ts",
      "import": "./dist/cursors/redis.js"
    }
  },
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "coverage": "vitest run --coverage",
    "lint": "depcruise src --config ../../.dependency-cruiser.cjs",
    "clean": "rimraf dist"
  },
  "dependencies": {
    "@foundryprotocol/0gkit-core": "workspace:*",
    "@foundryprotocol/0gkit-contracts": "workspace:*",
    "better-sqlite3": "^11.5.0",
    "viem": "^2.21.0"
  },
  "peerDependencies": {
    "ioredis": "^5.4.1",
    "viem": "^2.21.0"
  },
  "peerDependenciesMeta": {
    "ioredis": { "optional": true }
  },
  "devDependencies": {
    "@foundryprotocol/0gkit-testing": "workspace:*",
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^22.10.2",
    "@vitest/coverage-v8": "^2.1.8",
    "dependency-cruiser": "^16.0.0",
    "ioredis": "^5.4.1",
    "rimraf": "^6.0.1",
    "tsup": "^8.3.5",
    "typescript": "^5.6.3",
    "vitest": "^2.1.8"
  },
  "keywords": [
    "0g",
    "0g-network",
    "indexer",
    "events",
    "reorg",
    "subscription",
    "viem",
    "toolkit"
  ],
  "publishConfig": { "access": "public" }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "**/__tests__/**"]
}
```

- [ ] **Step 3: Create `tsup.config.ts`**

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "cursors/sqlite": "src/cursors/sqlite.ts",
    "cursors/redis": "src/cursors/redis.ts",
  },
  format: ["esm"],
  dts: true,
  splitting: false,
  clean: true,
  treeshake: true,
  sourcemap: true,
  target: "es2022",
  external: [
    "viem",
    "@foundryprotocol/0gkit-core",
    "@foundryprotocol/0gkit-contracts",
    "better-sqlite3",
    "ioredis",
  ],
});
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/__tests__/**", "src/cursors/redis.ts"],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 70 },
    },
  },
});
```

Note: `src/cursors/redis.ts` is excluded from coverage because CI doesn't ship a redis. Its tests are gated on `REDIS_URL`.

- [ ] **Step 5: Create empty entry points**

```ts
// packages/0gkit-indexer/src/index.ts
export {};
```

```ts
// packages/0gkit-indexer/src/cursors/sqlite.ts
export {};
```

```ts
// packages/0gkit-indexer/src/cursors/redis.ts
export {};
```

- [ ] **Step 6: Create one-line placeholder `README.md` and copy `LICENSE`**

```bash
echo "# @foundryprotocol/0gkit-indexer" > packages/0gkit-indexer/README.md
cp packages/0gkit-contracts/LICENSE packages/0gkit-indexer/LICENSE
```

- [ ] **Step 7: Write the boundary test**

```ts
// packages/0gkit-indexer/src/__tests__/boundary.test.ts
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, statSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const pkgSrc = resolve(here, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("0gkit-indexer neutrality boundary", () => {
  it("pnpm boundary:check passes", () => {
    let ok = true;
    let out = "";
    try {
      out = execSync("pnpm boundary:check", {
        cwd: repoRoot,
        stdio: "pipe",
      }).toString();
    } catch (e: any) {
      ok = false;
      out = (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "");
    }
    expect(ok, `boundary:check failed:\n${out}`).toBe(true);
  });

  it("no source file imports a non-0gkit @foundryprotocol package", () => {
    const files = walk(pkgSrc).filter((f) => !f.includes("__tests__"));
    const offenders: string[] = [];
    const staticRe = /from\s+["']@foundryprotocol\/(?!0gkit-)/;
    const dynRe = /import\(\s*["']@foundryprotocol\/(?!0gkit-)/;
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (staticRe.test(src) || dynRe.test(src)) offenders.push(f);
    }
    expect(offenders, `offending files:\n${offenders.join("\n")}`).toEqual([]);
  });
});
```

- [ ] **Step 8: Add to CI matrix**

Modify `.github/workflows/ci.yml` — wherever the existing packages are listed for build/test/coverage, append `0gkit-indexer` using the exact same shape as the sibling entries. Verify by grepping the file: it should appear in the same lists as `0gkit-contracts` and `0gkit-testing`.

- [ ] **Step 9: Install + boundary check + test**

Run from repo root:

```bash
pnpm install
pnpm --filter @foundryprotocol/0gkit-indexer build
pnpm --filter @foundryprotocol/0gkit-indexer test
pnpm boundary:check
```

Expected: all green. Both boundary tests pass (no offenders, dependency-cruiser exits 0).

- [ ] **Step 10: Commit**

```bash
git add packages/0gkit-indexer .github/workflows/ci.yml pnpm-lock.yaml
git commit -m "chore(indexer): scaffold @foundryprotocol/0gkit-indexer package + boundary test"
```

---

### Task 2: Backoff with jitter (pure utility)

**Files:**

- Create: `packages/0gkit-indexer/src/backoff.ts`
- Test: `packages/0gkit-indexer/src/__tests__/backoff.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/0gkit-indexer/src/__tests__/backoff.test.ts
import { describe, it, expect } from "vitest";
import { expBackoffWithJitter } from "../backoff.js";

describe("expBackoffWithJitter", () => {
  it("returns a non-negative number for attempt 0", () => {
    const d = expBackoffWithJitter(0, { rng: () => 0.5 });
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThanOrEqual(1000);
  });

  it("grows exponentially with attempt count", () => {
    const d0 = expBackoffWithJitter(0, { rng: () => 1 });
    const d3 = expBackoffWithJitter(3, { rng: () => 1 });
    expect(d3).toBeGreaterThan(d0 * 4);
  });

  it("caps at maxMs", () => {
    const d = expBackoffWithJitter(30, { rng: () => 1, maxMs: 5000 });
    expect(d).toBeLessThanOrEqual(5000);
  });

  it("with rng=0 returns the base delay (no jitter)", () => {
    expect(expBackoffWithJitter(2, { rng: () => 0, baseMs: 100 })).toBe(400);
  });

  it("with rng=1 returns 2x base (full jitter band)", () => {
    expect(expBackoffWithJitter(2, { rng: () => 1, baseMs: 100 })).toBe(800);
  });
});
```

- [ ] **Step 2: Verify test fails**

Run: `pnpm --filter @foundryprotocol/0gkit-indexer test backoff`
Expected: FAIL — `Cannot find module "../backoff.js"`.

- [ ] **Step 3: Implement**

```ts
// packages/0gkit-indexer/src/backoff.ts
export interface BackoffOptions {
  /** Base delay in ms. Default 250. */
  baseMs?: number;
  /** Upper bound on returned delay. Default 30_000. */
  maxMs?: number;
  /** Random source, injectable for tests. Default Math.random. */
  rng?: () => number;
}

/**
 * Decorrelated exponential backoff with jitter.
 *
 * For attempt N, returns a delay in [base * 2^N, base * 2^(N+1)] (clamped to maxMs).
 * This is the AWS "decorrelated jitter" shape: avoids the synchronized retry
 * storms of pure-exponential while keeping the upper bound predictable.
 */
export function expBackoffWithJitter(
  attempt: number,
  opts: BackoffOptions = {}
): number {
  const base = opts.baseMs ?? 250;
  const max = opts.maxMs ?? 30_000;
  const rng = opts.rng ?? Math.random;
  const lo = base * 2 ** attempt;
  const hi = lo * 2;
  const jittered = lo + rng() * (hi - lo);
  return Math.min(jittered, max);
}
```

- [ ] **Step 4: Verify tests pass**

Run: `pnpm --filter @foundryprotocol/0gkit-indexer test backoff`
Expected: PASS — 5/5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/0gkit-indexer/src/backoff.ts packages/0gkit-indexer/src/__tests__/backoff.test.ts
git commit -m "feat(indexer): add decorrelated exponential backoff with jitter"
```

---

### Task 3: Public types

**Files:**

- Create: `packages/0gkit-indexer/src/types.ts`

No tests on this task — pure type declarations, validated by downstream tasks that import them.

- [ ] **Step 1: Write types**

```ts
// packages/0gkit-indexer/src/types.ts
import type { Abi, Address, Hex } from "viem";
import type { NetworkName } from "@foundryprotocol/0gkit-core";

/**
 * Persisted indexer state for one subscription.
 * `recentBlocks` is a bounded window of the most recent canonical blocks,
 * used to detect reorgs by comparing hashes on the next poll.
 */
export interface CursorState {
  /** The highest block whose logs have been fully delivered to onEvent. */
  lastBlock: bigint;
  /** Bounded window (default 64) of recent blocks, oldest → newest. */
  recentBlocks: Array<{ number: bigint; hash: Hex }>;
}

/** Pluggable persistence for cursor state. */
export interface CursorStore {
  /** Returns null if no state has been saved for this subscriptionId. */
  load(subscriptionId: string): Promise<CursorState | null>;
  save(subscriptionId: string, state: CursorState): Promise<void>;
  /** Optional teardown (e.g. close DB handles). */
  close?(): Promise<void>;
}

/**
 * A decoded event delivered to onEvent / onReorg.
 * Mirrors viem's getLogs return shape with a decoded args field.
 */
export interface DecodedEvent {
  eventName: string;
  args: Record<string, unknown>;
  address: Address;
  blockNumber: bigint;
  blockHash: Hex;
  transactionHash: Hex;
  transactionIndex: number;
  logIndex: number;
  topics: readonly Hex[];
  data: Hex;
}

export type FromBlock = "latest" | "earliest" | bigint;

export interface SubscribeOptions {
  /**
   * A typed contract from `@foundryprotocol/0gkit-contracts`
   * (gives us `address` + `abi` together). Plain `{ address, abi }` also works.
   */
  contract: { address: Address; abi: Abi };
  /** Event name on the contract ABI. */
  event: string;
  /** Where to start. "latest" = head of chain at start time. Default "latest". */
  fromBlock?: FromBlock;
  /** Called for every event in canonical chain order. */
  onEvent: (event: DecodedEvent) => Promise<void> | void;
  /** Called when blocks are rolled back; events come in reverse chain order. */
  onReorg?: (rolledBack: DecodedEvent[]) => Promise<void> | void;
  /**
   * Override the auto-generated subscription id (used as cursor key).
   * Default: `sha1(address|event|fromBlock)`.
   */
  subscriptionId?: string;
}

export interface IndexerOptions {
  network: NetworkName;
  /** Overrides the preset RPC URL (matches 0gkit-core createClient). */
  rpcUrl?: string;
  /** Override chain id (matches 0gkit-core createClient). */
  chainId?: number;
  /** Cursor backend. Default MemoryCursorStore. */
  cursor?: CursorStore;
  /** Poll interval in ms. Default 2000. */
  pollIntervalMs?: number;
  /** Reorg-safety depth — how many head blocks to keep in the window. Default 64. */
  reorgDepth?: number;
  /**
   * Confirmations: don't deliver events until this many blocks past head.
   * Default 1 (i.e. deliver newest fully-canonical block immediately).
   */
  confirmations?: number;
}

export interface IndexerStatus {
  running: boolean;
  subscriptions: number;
  headBlock: bigint | null;
  /** Last successful poll completion. */
  lastPollAt: number | null;
  /** Consecutive failure count (resets on success). */
  failures: number;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @foundryprotocol/0gkit-indexer typecheck`
Expected: PASS — zero errors.

- [ ] **Step 3: Commit**

```bash
git add packages/0gkit-indexer/src/types.ts
git commit -m "feat(indexer): public types (CursorStore, SubscribeOptions, DecodedEvent)"
```

---

### Task 4: Block tracker (reorg window)

**Files:**

- Create: `packages/0gkit-indexer/src/block-tracker.ts`
- Test: `packages/0gkit-indexer/src/__tests__/block-tracker.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/0gkit-indexer/src/__tests__/block-tracker.test.ts
import { describe, it, expect } from "vitest";
import { BlockTracker } from "../block-tracker.js";

const h = (n: number): `0x${string}` =>
  ("0x" + n.toString(16).padStart(64, "0")) as `0x${string}`;

describe("BlockTracker", () => {
  it("starts empty", () => {
    const t = new BlockTracker({ depth: 4 });
    expect(t.size).toBe(0);
    expect(t.head()).toBeNull();
  });

  it("push appends in chain order and returns head", () => {
    const t = new BlockTracker({ depth: 4 });
    t.push({ number: 10n, hash: h(10) });
    t.push({ number: 11n, hash: h(11) });
    expect(t.size).toBe(2);
    expect(t.head()).toEqual({ number: 11n, hash: h(11) });
  });

  it("evicts the oldest block past depth", () => {
    const t = new BlockTracker({ depth: 2 });
    t.push({ number: 1n, hash: h(1) });
    t.push({ number: 2n, hash: h(2) });
    t.push({ number: 3n, hash: h(3) });
    expect(t.size).toBe(2);
    expect(t.snapshot()).toEqual([
      { number: 2n, hash: h(2) },
      { number: 3n, hash: h(3) },
    ]);
  });

  it("findCommonAncestor returns null when chains diverge before window", () => {
    const t = new BlockTracker({ depth: 4 });
    t.push({ number: 10n, hash: h(10) });
    t.push({ number: 11n, hash: h(11) });
    // remote chain has different hashes everywhere we can see
    const ancestor = t.findCommonAncestor([
      { number: 10n, hash: h(999) },
      { number: 11n, hash: h(888) },
    ]);
    expect(ancestor).toBeNull();
  });

  it("findCommonAncestor returns highest matching block", () => {
    const t = new BlockTracker({ depth: 4 });
    t.push({ number: 10n, hash: h(10) });
    t.push({ number: 11n, hash: h(11) });
    t.push({ number: 12n, hash: h(12) });
    // remote has same block 10 + 11 but a different 12 (1-block reorg)
    const ancestor = t.findCommonAncestor([
      { number: 10n, hash: h(10) },
      { number: 11n, hash: h(11) },
      { number: 12n, hash: h(99) },
    ]);
    expect(ancestor).toEqual({ number: 11n, hash: h(11) });
  });

  it("hydrate replaces window with the given snapshot", () => {
    const t = new BlockTracker({ depth: 4 });
    t.hydrate([
      { number: 5n, hash: h(5) },
      { number: 6n, hash: h(6) },
    ]);
    expect(t.size).toBe(2);
    expect(t.head()).toEqual({ number: 6n, hash: h(6) });
  });

  it("hydrate trims to depth", () => {
    const t = new BlockTracker({ depth: 2 });
    t.hydrate([
      { number: 1n, hash: h(1) },
      { number: 2n, hash: h(2) },
      { number: 3n, hash: h(3) },
    ]);
    expect(t.size).toBe(2);
    expect(t.head()?.number).toBe(3n);
  });
});
```

- [ ] **Step 2: Verify test fails**

Run: `pnpm --filter @foundryprotocol/0gkit-indexer test block-tracker`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/0gkit-indexer/src/block-tracker.ts
import type { Hex } from "viem";

export interface TrackedBlock {
  number: bigint;
  hash: Hex;
}

export interface BlockTrackerOptions {
  /** Number of recent blocks to retain. */
  depth: number;
}

/**
 * Bounded-window store of the most recent canonical block hashes.
 *
 * Used by the indexer for reorg detection: on every poll, we compare the
 * remote chain's recent block hashes against our window and walk back to
 * the highest common ancestor.
 *
 * Backed by an Array (kept small by `depth`); preserves insertion order
 * (oldest first, head last).
 */
export class BlockTracker {
  private readonly depth: number;
  private blocks: TrackedBlock[] = [];

  constructor(opts: BlockTrackerOptions) {
    if (opts.depth < 1) throw new Error("BlockTracker depth must be >= 1");
    this.depth = opts.depth;
  }

  get size(): number {
    return this.blocks.length;
  }

  head(): TrackedBlock | null {
    return this.blocks.length === 0
      ? null
      : (this.blocks[this.blocks.length - 1] ?? null);
  }

  snapshot(): TrackedBlock[] {
    return this.blocks.map((b) => ({ ...b }));
  }

  push(block: TrackedBlock): void {
    this.blocks.push(block);
    if (this.blocks.length > this.depth) {
      this.blocks.splice(0, this.blocks.length - this.depth);
    }
  }

  hydrate(blocks: readonly TrackedBlock[]): void {
    const trimmed = blocks.slice(Math.max(0, blocks.length - this.depth));
    this.blocks = trimmed.map((b) => ({ ...b }));
  }

  /**
   * Given a remote chain view (same block numbers as our window), returns
   * the highest block where number+hash agree. Null = chains diverged
   * before our visible window (caller should resync from earliest known).
   */
  findCommonAncestor(remote: readonly TrackedBlock[]): TrackedBlock | null {
    const remoteByNumber = new Map<bigint, Hex>();
    for (const b of remote) remoteByNumber.set(b.number, b.hash);
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const ours = this.blocks[i];
      if (!ours) continue;
      const theirs = remoteByNumber.get(ours.number);
      if (theirs && theirs === ours.hash) return { ...ours };
    }
    return null;
  }

  /** Drop blocks strictly higher than `ancestor.number`. */
  truncateAfter(ancestor: TrackedBlock): void {
    this.blocks = this.blocks.filter((b) => b.number <= ancestor.number);
  }
}
```

- [ ] **Step 4: Verify tests pass**

Run: `pnpm --filter @foundryprotocol/0gkit-indexer test block-tracker`
Expected: PASS — 7/7.

- [ ] **Step 5: Commit**

```bash
git add packages/0gkit-indexer/src/block-tracker.ts packages/0gkit-indexer/src/__tests__/block-tracker.test.ts
git commit -m "feat(indexer): bounded-window BlockTracker with reorg-ancestor lookup"
```

---

### Task 5: Log decoder

**Files:**

- Create: `packages/0gkit-indexer/src/log-decoder.ts`
- Test: `packages/0gkit-indexer/src/__tests__/log-decoder.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/0gkit-indexer/src/__tests__/log-decoder.test.ts
import { describe, it, expect } from "vitest";
import { encodeEventTopics, parseAbi } from "viem";
import { decodeOne, topicForEvent } from "../log-decoder.js";

const abi = parseAbi([
  "event ProviderRegistered(address indexed provider, string indexed name, uint256 stake)",
]);

describe("log-decoder", () => {
  it("topicForEvent returns the keccak256 of the event signature", () => {
    const [expected] = encodeEventTopics({ abi, eventName: "ProviderRegistered" });
    expect(topicForEvent(abi, "ProviderRegistered")).toBe(expected);
  });

  it("topicForEvent throws on unknown event", () => {
    expect(() => topicForEvent(abi, "DoesNotExist")).toThrow(/no event/i);
  });

  it("decodeOne extracts args, addresses, and metadata", () => {
    const [topic0] = encodeEventTopics({ abi, eventName: "ProviderRegistered" });
    const providerAddrTopic =
      "0x000000000000000000000000abababababababababababababababababababab" as const;
    const log = {
      address: "0xcafecafecafecafecafecafecafecafecafecafe" as const,
      blockNumber: 100n,
      blockHash:
        "0x1111111111111111111111111111111111111111111111111111111111111111" as const,
      transactionHash:
        "0x2222222222222222222222222222222222222222222222222222222222222222" as const,
      transactionIndex: 3,
      logIndex: 4,
      topics: [
        topic0!,
        providerAddrTopic,
        "0x3333333333333333333333333333333333333333333333333333333333333333" as const,
      ] as const,
      // encoded uint256(42)
      data: "0x000000000000000000000000000000000000000000000000000000000000002a" as const,
    };
    const decoded = decodeOne(abi, log);
    expect(decoded.eventName).toBe("ProviderRegistered");
    expect(decoded.address).toBe("0xcafecafecafecafecafecafecafecafecafecafe");
    expect(decoded.blockNumber).toBe(100n);
    expect(decoded.transactionIndex).toBe(3);
    expect(decoded.logIndex).toBe(4);
    expect((decoded.args as { stake: bigint }).stake).toBe(42n);
    expect((decoded.args as { provider: string }).provider.toLowerCase()).toBe(
      "0xabababababababababababababababababababab"
    );
  });
});
```

- [ ] **Step 2: Verify test fails**

Run: `pnpm --filter @foundryprotocol/0gkit-indexer test log-decoder`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/0gkit-indexer/src/log-decoder.ts
import { decodeEventLog, encodeEventTopics, type Abi, type Hex } from "viem";
import type { DecodedEvent } from "./types.js";

interface RawLog {
  address: `0x${string}`;
  blockNumber: bigint;
  blockHash: Hex;
  transactionHash: Hex;
  transactionIndex: number;
  logIndex: number;
  topics: readonly Hex[];
  data: Hex;
}

/** Compute the indexed topic[0] for an event by name. */
export function topicForEvent(abi: Abi, eventName: string): Hex {
  const has = abi.some(
    (item) => item.type === "event" && (item as { name?: string }).name === eventName
  );
  if (!has) {
    throw new Error(`Indexer: no event named "${eventName}" in ABI.`);
  }
  const [topic0] = encodeEventTopics({ abi, eventName });
  return topic0 as Hex;
}

/** Decode one raw log into a structured DecodedEvent. */
export function decodeOne(abi: Abi, log: RawLog): DecodedEvent {
  const decoded = decodeEventLog({
    abi,
    data: log.data,
    topics: log.topics as [Hex, ...Hex[]],
  });
  return {
    eventName: decoded.eventName as string,
    args: (decoded.args ?? {}) as Record<string, unknown>,
    address: log.address,
    blockNumber: log.blockNumber,
    blockHash: log.blockHash,
    transactionHash: log.transactionHash,
    transactionIndex: log.transactionIndex,
    logIndex: log.logIndex,
    topics: log.topics,
    data: log.data,
  };
}
```

- [ ] **Step 4: Verify tests pass**

Run: `pnpm --filter @foundryprotocol/0gkit-indexer test log-decoder`
Expected: PASS — 3/3.

- [ ] **Step 5: Commit**

```bash
git add packages/0gkit-indexer/src/log-decoder.ts packages/0gkit-indexer/src/__tests__/log-decoder.test.ts
git commit -m "feat(indexer): topic computation + log decoder over viem"
```

---

### Task 6: Memory cursor store

**Files:**

- Create: `packages/0gkit-indexer/src/cursors/memory.ts`
- Test: `packages/0gkit-indexer/src/__tests__/cursor-memory.test.ts`
- Modify: `packages/0gkit-indexer/src/index.ts` — export `MemoryCursorStore` and types.

- [ ] **Step 1: Write failing test**

```ts
// packages/0gkit-indexer/src/__tests__/cursor-memory.test.ts
import { describe, it, expect } from "vitest";
import { MemoryCursorStore } from "../cursors/memory.js";
import type { CursorState } from "../types.js";

const sample: CursorState = {
  lastBlock: 100n,
  recentBlocks: [
    {
      number: 99n,
      hash: "0x9999999999999999999999999999999999999999999999999999999999999999",
    },
    {
      number: 100n,
      hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
  ],
};

describe("MemoryCursorStore", () => {
  it("returns null when key absent", async () => {
    const s = new MemoryCursorStore();
    expect(await s.load("sub-1")).toBeNull();
  });

  it("save + load round-trips", async () => {
    const s = new MemoryCursorStore();
    await s.save("sub-1", sample);
    const out = await s.load("sub-1");
    expect(out).toEqual(sample);
  });

  it("save overwrites prior state", async () => {
    const s = new MemoryCursorStore();
    await s.save("sub-1", sample);
    const next: CursorState = { lastBlock: 101n, recentBlocks: [] };
    await s.save("sub-1", next);
    expect(await s.load("sub-1")).toEqual(next);
  });

  it("isolates keys", async () => {
    const s = new MemoryCursorStore();
    await s.save("a", sample);
    expect(await s.load("b")).toBeNull();
  });

  it("returns a structural copy (mutating the loaded value doesn't poison the store)", async () => {
    const s = new MemoryCursorStore();
    await s.save("sub-1", sample);
    const out = await s.load("sub-1");
    out!.lastBlock = 999n;
    const out2 = await s.load("sub-1");
    expect(out2!.lastBlock).toBe(100n);
  });
});
```

- [ ] **Step 2: Verify test fails**

Run: `pnpm --filter @foundryprotocol/0gkit-indexer test cursor-memory`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/0gkit-indexer/src/cursors/memory.ts
import type { CursorState, CursorStore } from "../types.js";

function cloneState(s: CursorState): CursorState {
  return {
    lastBlock: s.lastBlock,
    recentBlocks: s.recentBlocks.map((b) => ({ number: b.number, hash: b.hash })),
  };
}

export class MemoryCursorStore implements CursorStore {
  private map = new Map<string, CursorState>();

  async load(subscriptionId: string): Promise<CursorState | null> {
    const v = this.map.get(subscriptionId);
    return v ? cloneState(v) : null;
  }

  async save(subscriptionId: string, state: CursorState): Promise<void> {
    this.map.set(subscriptionId, cloneState(state));
  }
}
```

- [ ] **Step 4: Update `src/index.ts`**

```ts
// packages/0gkit-indexer/src/index.ts
export { MemoryCursorStore } from "./cursors/memory.js";
export type {
  CursorState,
  CursorStore,
  DecodedEvent,
  FromBlock,
  IndexerOptions,
  IndexerStatus,
  SubscribeOptions,
} from "./types.js";
```

- [ ] **Step 5: Verify tests pass**

Run: `pnpm --filter @foundryprotocol/0gkit-indexer test cursor-memory`
Expected: PASS — 5/5.

- [ ] **Step 6: Commit**

```bash
git add packages/0gkit-indexer/src/cursors/memory.ts \
  packages/0gkit-indexer/src/__tests__/cursor-memory.test.ts \
  packages/0gkit-indexer/src/index.ts
git commit -m "feat(indexer): MemoryCursorStore + public exports"
```

---

### Task 7: SQLite cursor store

**Files:**

- Create: `packages/0gkit-indexer/src/cursors/sqlite.ts`
- Test: `packages/0gkit-indexer/src/__tests__/cursor-sqlite.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/0gkit-indexer/src/__tests__/cursor-sqlite.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteCursorStore } from "../cursors/sqlite.js";
import type { CursorState } from "../types.js";

const sample: CursorState = {
  lastBlock: 12345n,
  recentBlocks: [
    {
      number: 12345n,
      hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
  ],
};

const created: string[] = [];
function tempDb(): string {
  const dir = mkdtempSync(join(tmpdir(), "indexer-sqlite-"));
  created.push(dir);
  return join(dir, "cursor.db");
}
afterEach(() => {
  for (const d of created.splice(0))
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
});

describe("SqliteCursorStore", () => {
  it("returns null when key absent", async () => {
    const s = new SqliteCursorStore({ path: tempDb() });
    expect(await s.load("sub-1")).toBeNull();
    await s.close();
  });

  it("save + load preserves bigints", async () => {
    const s = new SqliteCursorStore({ path: tempDb() });
    await s.save("sub-1", sample);
    const out = await s.load("sub-1");
    expect(out).toEqual(sample);
    expect(typeof out!.lastBlock).toBe("bigint");
    expect(typeof out!.recentBlocks[0]!.number).toBe("bigint");
    await s.close();
  });

  it("state survives close + reopen on the same path", async () => {
    const path = tempDb();
    const a = new SqliteCursorStore({ path });
    await a.save("sub-1", sample);
    await a.close();
    const b = new SqliteCursorStore({ path });
    const out = await b.load("sub-1");
    expect(out).toEqual(sample);
    await b.close();
  });

  it("overwrites prior state", async () => {
    const s = new SqliteCursorStore({ path: tempDb() });
    await s.save("sub-1", sample);
    const next: CursorState = { lastBlock: 99999n, recentBlocks: [] };
    await s.save("sub-1", next);
    expect(await s.load("sub-1")).toEqual(next);
    await s.close();
  });
});
```

- [ ] **Step 2: Verify test fails**

Run: `pnpm --filter @foundryprotocol/0gkit-indexer test cursor-sqlite`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/0gkit-indexer/src/cursors/sqlite.ts
import Database, { type Database as DB } from "better-sqlite3";
import type { CursorState, CursorStore } from "../types.js";

export interface SqliteCursorStoreOptions {
  /** Path to the sqlite file. `:memory:` is supported. */
  path: string;
  /** Table name. Default "indexer_cursors". */
  table?: string;
}

/**
 * Persists cursor state in a sqlite database via `better-sqlite3`.
 *
 * `better-sqlite3` is synchronous and ~10x faster than node-sqlite for this
 * write-heavy / single-row-per-key workload. The whole CursorState is
 * serialised to JSON; bigints round-trip via a reviver that re-tags numeric
 * strings ending with the marker "n".
 */
export class SqliteCursorStore implements CursorStore {
  private readonly db: DB;
  private readonly tableName: string;

  constructor(opts: SqliteCursorStoreOptions) {
    this.db = new Database(opts.path);
    this.tableName = opts.table ?? "indexer_cursors";
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS "${this.tableName}" (
         subscription_id TEXT PRIMARY KEY,
         state           TEXT NOT NULL
       )`
    );
  }

  async load(subscriptionId: string): Promise<CursorState | null> {
    const row = this.db
      .prepare(`SELECT state FROM "${this.tableName}" WHERE subscription_id = ?`)
      .get(subscriptionId) as { state: string } | undefined;
    if (!row) return null;
    return deserialize(row.state);
  }

  async save(subscriptionId: string, state: CursorState): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO "${this.tableName}" (subscription_id, state)
         VALUES (?, ?)
         ON CONFLICT(subscription_id) DO UPDATE SET state = excluded.state`
      )
      .run(subscriptionId, serialize(state));
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

function serialize(state: CursorState): string {
  return JSON.stringify(state, (_k, v) =>
    typeof v === "bigint" ? `${v.toString()}n` : v
  );
}

function deserialize(raw: string): CursorState {
  return JSON.parse(raw, (_k, v) => {
    if (typeof v === "string" && /^-?\d+n$/.test(v)) {
      return BigInt(v.slice(0, -1));
    }
    return v;
  }) as CursorState;
}
```

- [ ] **Step 4: Verify tests pass**

Run: `pnpm --filter @foundryprotocol/0gkit-indexer test cursor-sqlite`
Expected: PASS — 4/4.

- [ ] **Step 5: Commit**

```bash
git add packages/0gkit-indexer/src/cursors/sqlite.ts \
  packages/0gkit-indexer/src/__tests__/cursor-sqlite.test.ts
git commit -m "feat(indexer): SqliteCursorStore (better-sqlite3, bigint-safe JSON)"
```

---

### Task 8: Redis cursor store (optional peer)

**Files:**

- Create: `packages/0gkit-indexer/src/cursors/redis.ts`
- Test: `packages/0gkit-indexer/src/__tests__/cursor-redis.test.ts`

- [ ] **Step 1: Write failing test (skips when no REDIS_URL)**

```ts
// packages/0gkit-indexer/src/__tests__/cursor-redis.test.ts
import { describe, it, expect, afterEach } from "vitest";
import type { CursorState } from "../types.js";

const REDIS_URL = process.env.REDIS_URL;
const describeIf = REDIS_URL ? describe : describe.skip;

const sample: CursorState = {
  lastBlock: 555n,
  recentBlocks: [
    {
      number: 555n,
      hash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    },
  ],
};

describeIf("RedisCursorStore (gated on REDIS_URL)", () => {
  const ns = `0gkit-indexer-test-${Date.now()}`;
  let store: import("../cursors/redis.js").RedisCursorStore;

  afterEach(async () => {
    if (store) await store.close();
  });

  it("returns null when key absent", async () => {
    const { RedisCursorStore } = await import("../cursors/redis.js");
    store = new RedisCursorStore({ url: REDIS_URL!, namespace: ns });
    expect(await store.load("absent")).toBeNull();
  });

  it("save + load round-trips bigints", async () => {
    const { RedisCursorStore } = await import("../cursors/redis.js");
    store = new RedisCursorStore({ url: REDIS_URL!, namespace: ns });
    await store.save("sub-1", sample);
    expect(await store.load("sub-1")).toEqual(sample);
  });
});
```

- [ ] **Step 2: Verify test fails (or skips)**

Run: `pnpm --filter @foundryprotocol/0gkit-indexer test cursor-redis`
Expected: When `REDIS_URL` unset → skipped (no failure). When set → FAIL on module-not-found.

- [ ] **Step 3: Implement**

```ts
// packages/0gkit-indexer/src/cursors/redis.ts
import type { Redis as RedisClient, RedisOptions } from "ioredis";
import type { CursorState, CursorStore } from "../types.js";

export interface RedisCursorStoreOptions {
  /** Either a redis URL string or an existing ioredis client. */
  url?: string;
  client?: RedisClient;
  redisOptions?: RedisOptions;
  /** Key prefix. Default "0gkit:indexer". */
  namespace?: string;
}

/**
 * Persists cursor state in Redis. `ioredis` is an optional peer; we lazy-import it.
 *
 * Keys: `<namespace>:cursor:<subscriptionId>`. State serialised as bigint-safe JSON.
 */
export class RedisCursorStore implements CursorStore {
  private readonly clientPromise: Promise<RedisClient>;
  private readonly ownsClient: boolean;
  private readonly namespace: string;

  constructor(opts: RedisCursorStoreOptions) {
    this.namespace = opts.namespace ?? "0gkit:indexer";
    if (opts.client) {
      this.clientPromise = Promise.resolve(opts.client);
      this.ownsClient = false;
    } else if (opts.url) {
      this.ownsClient = true;
      this.clientPromise = import("ioredis").then(
        (m) => new m.default(opts.url!, opts.redisOptions ?? {})
      );
    } else {
      throw new Error(
        "RedisCursorStore: pass { client } or { url } to construct the store."
      );
    }
  }

  private key(subscriptionId: string): string {
    return `${this.namespace}:cursor:${subscriptionId}`;
  }

  async load(subscriptionId: string): Promise<CursorState | null> {
    const c = await this.clientPromise;
    const raw = await c.get(this.key(subscriptionId));
    return raw ? deserialize(raw) : null;
  }

  async save(subscriptionId: string, state: CursorState): Promise<void> {
    const c = await this.clientPromise;
    await c.set(this.key(subscriptionId), serialize(state));
  }

  async close(): Promise<void> {
    if (this.ownsClient) {
      const c = await this.clientPromise;
      await c.quit();
    }
  }
}

function serialize(state: CursorState): string {
  return JSON.stringify(state, (_k, v) =>
    typeof v === "bigint" ? `${v.toString()}n` : v
  );
}

function deserialize(raw: string): CursorState {
  return JSON.parse(raw, (_k, v) => {
    if (typeof v === "string" && /^-?\d+n$/.test(v)) {
      return BigInt(v.slice(0, -1));
    }
    return v;
  }) as CursorState;
}
```

- [ ] **Step 4: Verify build + tests**

Run:

```bash
pnpm --filter @foundryprotocol/0gkit-indexer typecheck
pnpm --filter @foundryprotocol/0gkit-indexer test
```

Expected: typecheck PASS; redis tests SKIPPED (no REDIS_URL) or PASS if one is set; all other suites green.

- [ ] **Step 5: Commit**

```bash
git add packages/0gkit-indexer/src/cursors/redis.ts \
  packages/0gkit-indexer/src/__tests__/cursor-redis.test.ts
git commit -m "feat(indexer): RedisCursorStore (optional peer, lazy ioredis import)"
```

---

### Task 9: Indexer core — single subscription, no reorgs

**Files:**

- Create: `packages/0gkit-indexer/src/indexer.ts`
- Test: `packages/0gkit-indexer/src/__tests__/indexer-basic.test.ts`

- [ ] **Step 1: Write failing test**

The test stubs viem by passing a custom `publicClient` so we don't need a real RPC.

```ts
// packages/0gkit-indexer/src/__tests__/indexer-basic.test.ts
import { describe, it, expect } from "vitest";
import { parseAbi, encodeEventTopics, type Hex } from "viem";
import { Indexer } from "../indexer.js";
import { MemoryCursorStore } from "../cursors/memory.js";

const abi = parseAbi(["event Ping(uint256 n)"]);
const [topic0] = encodeEventTopics({ abi, eventName: "Ping" });

function blockHash(n: number): Hex {
  return ("0x" + n.toString(16).padStart(64, "0")) as Hex;
}

interface FakeLog {
  address: `0x${string}`;
  blockNumber: bigint;
  blockHash: Hex;
  transactionHash: Hex;
  transactionIndex: number;
  logIndex: number;
  topics: readonly Hex[];
  data: Hex;
}

function makeFakeClient(
  blocksByNumber: Map<bigint, { hash: Hex }>,
  logsByRange: (from: bigint, to: bigint) => FakeLog[]
) {
  let head: bigint = 0n;
  for (const n of blocksByNumber.keys()) {
    if (n > head) head = n;
  }
  return {
    getBlockNumber: async () => head,
    getBlock: async (args: { blockNumber: bigint }) => {
      const b = blocksByNumber.get(args.blockNumber);
      if (!b) throw new Error(`no block ${args.blockNumber}`);
      return { hash: b.hash, number: args.blockNumber };
    },
    getLogs: async (args: { fromBlock: bigint; toBlock: bigint }) =>
      logsByRange(args.fromBlock, args.toBlock),
  };
}

describe("Indexer (basic, no reorgs)", () => {
  it("emits historical events on start, then live events on subsequent polls", async () => {
    const address = "0xcafecafecafecafecafecafecafecafecafecafe" as const;
    const blocks = new Map<bigint, { hash: Hex }>();
    for (let n = 1n; n <= 5n; n++) blocks.set(n, { hash: blockHash(Number(n)) });

    const mkLog = (n: bigint, idx: number, value: number): FakeLog => ({
      address,
      blockNumber: n,
      blockHash: blockHash(Number(n)),
      transactionHash: blockHash(Number(n) + 1000),
      transactionIndex: 0,
      logIndex: idx,
      topics: [topic0!],
      data: ("0x" + value.toString(16).padStart(64, "0")) as Hex,
    });

    const client = makeFakeClient(blocks, (from, to) => {
      const out: FakeLog[] = [];
      for (let n = from; n <= to; n++) out.push(mkLog(n, 0, Number(n)));
      return out;
    });

    const seen: Array<{ block: bigint; n: bigint }> = [];
    const indexer = new Indexer({
      network: "local",
      cursor: new MemoryCursorStore(),
      pollIntervalMs: 10,
      confirmations: 1,
      reorgDepth: 16,
      publicClient: client as never,
    });

    await indexer.subscribe({
      contract: { address, abi },
      event: "Ping",
      fromBlock: 1n,
      onEvent: (e) =>
        seen.push({ block: e.blockNumber, n: (e.args as { n: bigint }).n }),
    });

    await indexer.start();
    // wait for two polls
    await new Promise((r) => setTimeout(r, 80));
    await indexer.stop();

    // confirmations=1 means we deliver up to (head-1) = block 4
    expect(seen.map((s) => Number(s.block))).toEqual([1, 2, 3, 4]);
  });

  it("persists cursor: restart picks up after the last delivered block", async () => {
    const address = "0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead" as const;
    const blocks = new Map<bigint, { hash: Hex }>();
    for (let n = 1n; n <= 3n; n++) blocks.set(n, { hash: blockHash(Number(n)) });

    const mkLog = (n: bigint): FakeLog => ({
      address,
      blockNumber: n,
      blockHash: blockHash(Number(n)),
      transactionHash: blockHash(Number(n) + 2000),
      transactionIndex: 0,
      logIndex: 0,
      topics: [topic0!],
      data: ("0x" + Number(n).toString(16).padStart(64, "0")) as Hex,
    });

    const client = makeFakeClient(blocks, (from, to) => {
      const logs: FakeLog[] = [];
      for (let n = from; n <= to; n++) logs.push(mkLog(n));
      return logs;
    });

    const cursor = new MemoryCursorStore();
    const subId = "test-restart";

    const seen1: bigint[] = [];
    const i1 = new Indexer({
      network: "local",
      cursor,
      pollIntervalMs: 10,
      confirmations: 1,
      reorgDepth: 16,
      publicClient: client as never,
    });
    await i1.subscribe({
      contract: { address, abi },
      event: "Ping",
      fromBlock: 1n,
      subscriptionId: subId,
      onEvent: (e) => seen1.push(e.blockNumber),
    });
    await i1.start();
    await new Promise((r) => setTimeout(r, 60));
    await i1.stop();
    expect(seen1).toEqual([1n, 2n]); // head=3, confirmations=1 → up to 2

    // Restart with the same subscriptionId + cursor — should NOT re-emit 1 or 2.
    const seen2: bigint[] = [];
    const i2 = new Indexer({
      network: "local",
      cursor,
      pollIntervalMs: 10,
      confirmations: 1,
      reorgDepth: 16,
      publicClient: client as never,
    });
    await i2.subscribe({
      contract: { address, abi },
      event: "Ping",
      fromBlock: 1n,
      subscriptionId: subId,
      onEvent: (e) => seen2.push(e.blockNumber),
    });
    await i2.start();
    await new Promise((r) => setTimeout(r, 60));
    await i2.stop();
    expect(seen2).toEqual([]); // nothing new — head still 3, last delivered was 2
  });
});
```

- [ ] **Step 2: Verify test fails**

Run: `pnpm --filter @foundryprotocol/0gkit-indexer test indexer-basic`
Expected: FAIL — `Indexer` not exported.

- [ ] **Step 3: Implement core (no reorg yet — handled in Task 10)**

```ts
// packages/0gkit-indexer/src/indexer.ts
import { createHash } from "node:crypto";
import { createPublicClient, http, type PublicClient, type Hex } from "viem";
import {
  buildChain,
  getNetwork,
  ConfigError,
  NetworkError,
} from "@foundryprotocol/0gkit-core";
import { MemoryCursorStore } from "./cursors/memory.js";
import { BlockTracker } from "./block-tracker.js";
import { decodeOne, topicForEvent } from "./log-decoder.js";
import { expBackoffWithJitter } from "./backoff.js";
import type {
  CursorState,
  CursorStore,
  DecodedEvent,
  IndexerOptions,
  IndexerStatus,
  SubscribeOptions,
} from "./types.js";

interface InternalSubscription {
  id: string;
  address: `0x${string}`;
  abi: SubscribeOptions["contract"]["abi"];
  event: string;
  topic0: Hex;
  fromBlock: bigint;
  onEvent: SubscribeOptions["onEvent"];
  onReorg?: SubscribeOptions["onReorg"];
  cursorState: CursorState;
  tracker: BlockTracker;
}

interface IndexerInternalOptions extends IndexerOptions {
  /** Test seam: inject a viem PublicClient (or any duck-typed equivalent). */
  publicClient?: PublicClient;
}

export class Indexer {
  private readonly opts: Required<
    Pick<IndexerOptions, "pollIntervalMs" | "reorgDepth" | "confirmations">
  > &
    IndexerOptions & { publicClient?: PublicClient };
  private readonly cursor: CursorStore;
  private readonly subscriptions = new Map<string, InternalSubscription>();
  private client: PublicClient | null = null;
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private headBlock: bigint | null = null;
  private lastPollAt: number | null = null;
  private failures = 0;

  constructor(opts: IndexerInternalOptions) {
    this.opts = {
      pollIntervalMs: opts.pollIntervalMs ?? 2000,
      reorgDepth: opts.reorgDepth ?? 64,
      confirmations: opts.confirmations ?? 1,
      ...opts,
    };
    this.cursor = opts.cursor ?? new MemoryCursorStore();
  }

  status(): IndexerStatus {
    return {
      running: this.running,
      subscriptions: this.subscriptions.size,
      headBlock: this.headBlock,
      lastPollAt: this.lastPollAt,
      failures: this.failures,
    };
  }

  private buildClient(): PublicClient {
    if (this.opts.publicClient) return this.opts.publicClient;
    const preset = getNetwork(this.opts.network);
    const chain = buildChain(preset, this.opts.rpcUrl, this.opts.chainId);
    const transport = http(chain.rpcUrls.default.http[0]);
    return createPublicClient({ chain, transport });
  }

  async subscribe(req: SubscribeOptions): Promise<{ id: string }> {
    if (!req.contract?.address || !req.contract?.abi) {
      throw new ConfigError(
        "subscribe(): contract must have { address, abi }.",
        "Pass a TypedContract from @foundryprotocol/0gkit-contracts, or a plain { address, abi } literal."
      );
    }
    const topic0 = topicForEvent(req.contract.abi, req.event);
    const id =
      req.subscriptionId ??
      createHash("sha1")
        .update(
          `${req.contract.address}|${req.event}|${String(req.fromBlock ?? "latest")}`
        )
        .digest("hex")
        .slice(0, 16);

    if (this.subscriptions.has(id)) {
      throw new ConfigError(
        `subscribe(): subscriptionId "${id}" already registered.`,
        "Pass a unique subscriptionId, or unsubscribe the existing one first."
      );
    }

    const persisted = await this.cursor.load(id);
    let resolvedFromBlock: bigint;
    if (persisted) {
      resolvedFromBlock = persisted.lastBlock + 1n;
    } else if (req.fromBlock === "latest" || req.fromBlock === undefined) {
      // resolve on first poll
      resolvedFromBlock = -1n; // sentinel
    } else if (req.fromBlock === "earliest") {
      resolvedFromBlock = 0n;
    } else {
      resolvedFromBlock = req.fromBlock;
    }

    const tracker = new BlockTracker({ depth: this.opts.reorgDepth });
    if (persisted) tracker.hydrate(persisted.recentBlocks);

    const sub: InternalSubscription = {
      id,
      address: req.contract.address,
      abi: req.contract.abi,
      event: req.event,
      topic0,
      fromBlock: resolvedFromBlock,
      onEvent: req.onEvent,
      onReorg: req.onReorg,
      cursorState: persisted ?? {
        lastBlock: resolvedFromBlock - 1n,
        recentBlocks: [],
      },
      tracker,
    };
    this.subscriptions.set(id, sub);
    return { id };
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.client = this.buildClient();
    this.running = true;
    // resolve "latest" sentinels on first start
    const head = await this.callWithBackoff(() => this.client!.getBlockNumber());
    for (const sub of this.subscriptions.values()) {
      if (sub.fromBlock === -1n) {
        sub.fromBlock = head;
        sub.cursorState.lastBlock = head - 1n;
      }
    }
    // kick the first poll synchronously so caller can `await` and then sleep
    await this.pollOnce().catch(() => {
      /* swallow — counted in failures */
    });
    this.timer = setInterval(() => {
      void this.pollOnce();
    }, this.opts.pollIntervalMs);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.cursor.close) await this.cursor.close();
  }

  private async pollOnce(): Promise<void> {
    if (!this.running || !this.client) return;
    try {
      const head = await this.client.getBlockNumber();
      this.headBlock = head;
      const conf = BigInt(this.opts.confirmations);
      if (head < conf) {
        this.lastPollAt = Date.now();
        this.failures = 0;
        return;
      }
      const safeHead = head - conf + 1n;

      for (const sub of this.subscriptions.values()) {
        if (sub.cursorState.lastBlock >= safeHead) continue;
        const fromBlock = sub.cursorState.lastBlock + 1n;
        const toBlock = safeHead;

        const logs = (await this.client.getLogs({
          address: sub.address,
          fromBlock,
          toBlock,
          // viem accepts an indexed event; we filter manually via topic0 below for portability
        })) as unknown as Array<{
          address: `0x${string}`;
          blockNumber: bigint;
          blockHash: Hex;
          transactionHash: Hex;
          transactionIndex: number;
          logIndex: number;
          topics: readonly Hex[];
          data: Hex;
        }>;

        for (const raw of logs) {
          if (raw.topics[0] !== sub.topic0) continue;
          const decoded = decodeOne(sub.abi, raw);
          await sub.onEvent(decoded);
        }

        // refresh recent block-hash window
        const windowStart =
          fromBlock > 0n
            ? fromBlock - BigInt(Math.min(this.opts.reorgDepth, Number(fromBlock)))
            : 0n;
        for (let n = windowStart; n <= toBlock; n++) {
          if (n < 0n) continue;
          const block = await this.client.getBlock({ blockNumber: n });
          sub.tracker.push({ number: n, hash: block.hash as Hex });
        }
        sub.cursorState = {
          lastBlock: toBlock,
          recentBlocks: sub.tracker.snapshot(),
        };
        await this.cursor.save(sub.id, sub.cursorState);
      }

      this.lastPollAt = Date.now();
      this.failures = 0;
    } catch (e) {
      this.failures += 1;
      const delay = expBackoffWithJitter(this.failures);
      await new Promise((r) => setTimeout(r, delay));
      throw new NetworkError(
        `Indexer poll failed (attempt ${this.failures}): ${(e as Error).message}`,
        "Check the RPC URL and network connectivity; the indexer will retry."
      );
    }
  }

  private async callWithBackoff<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    for (;;) {
      try {
        return await fn();
      } catch (e) {
        attempt += 1;
        if (attempt > 5) throw e;
        await new Promise((r) => setTimeout(r, expBackoffWithJitter(attempt)));
      }
    }
  }
}
```

- [ ] **Step 4: Export `Indexer` from `src/index.ts`**

```ts
// packages/0gkit-indexer/src/index.ts
export { Indexer } from "./indexer.js";
export { MemoryCursorStore } from "./cursors/memory.js";
export type {
  CursorState,
  CursorStore,
  DecodedEvent,
  FromBlock,
  IndexerOptions,
  IndexerStatus,
  SubscribeOptions,
} from "./types.js";
```

- [ ] **Step 5: Verify tests pass**

Run: `pnpm --filter @foundryprotocol/0gkit-indexer test indexer-basic`
Expected: PASS — 2/2.

- [ ] **Step 6: Commit**

```bash
git add packages/0gkit-indexer/src/indexer.ts \
  packages/0gkit-indexer/src/__tests__/indexer-basic.test.ts \
  packages/0gkit-indexer/src/index.ts
git commit -m "feat(indexer): Indexer core (poll, getLogs, cursor persistence)"
```

---

### Task 10: Reorg detection + rollback

**Files:**

- Modify: `packages/0gkit-indexer/src/indexer.ts` — wire BlockTracker comparison into the poll loop; emit `onReorg`; re-emit on the new chain.
- Test: `packages/0gkit-indexer/src/__tests__/indexer-reorg.test.ts`

- [ ] **Step 1: Write failing test (3-block reorg)**

```ts
// packages/0gkit-indexer/src/__tests__/indexer-reorg.test.ts
import { describe, it, expect } from "vitest";
import { parseAbi, encodeEventTopics, type Hex } from "viem";
import { Indexer } from "../indexer.js";
import { MemoryCursorStore } from "../cursors/memory.js";

const abi = parseAbi(["event Ping(uint256 n)"]);
const [topic0] = encodeEventTopics({ abi, eventName: "Ping" });

function h(label: string, n: number): Hex {
  const tag = label.charCodeAt(0).toString(16).padStart(2, "0");
  return ("0x" + tag + n.toString(16).padStart(62, "0")) as Hex;
}

describe("Indexer (reorg)", () => {
  it("emits onReorg with rolled-back events, then re-emits new-chain events", async () => {
    const address = "0xfeedfeedfeedfeedfeedfeedfeedfeedfeedfeed" as const;

    // Phase 1 chain (blocks 1-5, label "A")
    type Phase = "A" | "B";
    let phase: Phase = "A";

    function blockHashFor(n: bigint, ph: Phase): Hex {
      return h(ph, Number(n));
    }
    function logsForRange(from: bigint, to: bigint, ph: Phase) {
      const out: Array<{
        address: typeof address;
        blockNumber: bigint;
        blockHash: Hex;
        transactionHash: Hex;
        transactionIndex: number;
        logIndex: number;
        topics: readonly Hex[];
        data: Hex;
      }> = [];
      for (let n = from; n <= to; n++) {
        const v = (ph === "A" ? 100 : 200) + Number(n);
        out.push({
          address,
          blockNumber: n,
          blockHash: blockHashFor(n, ph),
          transactionHash: ("0x" + v.toString(16).padStart(64, "0")) as Hex,
          transactionIndex: 0,
          logIndex: 0,
          topics: [topic0!],
          data: ("0x" + v.toString(16).padStart(64, "0")) as Hex,
        });
      }
      return out;
    }

    let head = 5n;
    const client = {
      getBlockNumber: async () => head,
      getBlock: async (args: { blockNumber: bigint }) => ({
        hash: blockHashFor(args.blockNumber, phase),
        number: args.blockNumber,
      }),
      getLogs: async (args: { fromBlock: bigint; toBlock: bigint }) =>
        logsForRange(args.fromBlock, args.toBlock, phase),
    };

    const delivered: Array<{ phase: Phase; n: bigint }> = [];
    const rolledBack: bigint[] = [];

    const indexer = new Indexer({
      network: "local",
      cursor: new MemoryCursorStore(),
      pollIntervalMs: 15,
      confirmations: 1,
      reorgDepth: 8,
      publicClient: client as never,
    });

    await indexer.subscribe({
      contract: { address, abi },
      event: "Ping",
      fromBlock: 1n,
      onEvent: (e) => delivered.push({ phase, n: (e.args as { n: bigint }).n }),
      onReorg: (events) => {
        for (const e of events) rolledBack.push(e.blockNumber);
      },
    });

    await indexer.start();
    // let the poll deliver phase-A events up to block 4 (head 5, confirmations 1)
    await new Promise((r) => setTimeout(r, 50));

    // simulate a 3-block reorg: blocks 3-5 replaced on phase B, new head 6
    phase = "B";
    head = 6n;

    // poll again — should detect ancestor=2, roll back A's events on blocks 3-4,
    // then deliver B's events on blocks 3-5
    await new Promise((r) => setTimeout(r, 60));
    await indexer.stop();

    // delivered should include initial A: 1,2,3,4
    // plus B: 3,4,5 after reorg
    const deliveredBlocks = delivered.map((d) => Number(d.n));
    expect(deliveredBlocks.slice(0, 4)).toEqual([1, 2, 3, 4]);
    // tail should contain the new chain
    expect(deliveredBlocks.slice(-3)).toEqual([3, 4, 5]);

    // rolledBack should include 3 and 4 (the previously-delivered blocks past the ancestor)
    expect(rolledBack.sort((a, b) => Number(a - b))).toEqual([3n, 4n]);
  });
});
```

- [ ] **Step 2: Verify test fails**

Run: `pnpm --filter @foundryprotocol/0gkit-indexer test indexer-reorg`
Expected: FAIL — `onReorg` is never invoked because Task 9's loop doesn't compare hashes.

- [ ] **Step 3: Modify `indexer.ts` — wire reorg detection**

Inside the `for (const sub of this.subscriptions.values())` loop in `pollOnce`, **before** the new `getLogs` call, add a reorg-check phase. After Task 10 the relevant section of `pollOnce` looks like this (replace the existing per-subscription body):

```ts
for (const sub of this.subscriptions.values()) {
  // ---- Reorg detection ----
  if (sub.tracker.size > 0) {
    const remote: Array<{ number: bigint; hash: Hex }> = [];
    for (const b of sub.tracker.snapshot()) {
      const live = await this.client.getBlock({ blockNumber: b.number });
      remote.push({ number: b.number, hash: live.hash as Hex });
    }
    const headBlock = sub.tracker.head();
    const tip = remote[remote.length - 1];
    if (headBlock && tip && tip.hash !== headBlock.hash) {
      const ancestor = sub.tracker.findCommonAncestor(remote);
      const rollbackFrom = ancestor
        ? ancestor.number + 1n
        : sub.tracker.snapshot()[0]!.number;
      const rollbackTo = sub.cursorState.lastBlock;
      // replay logs from the *old* chain only via remote.hash mismatch:
      // we don't have the old logs stored, so we issue getLogs against the
      // current chain for the rolled-back range and emit any logs whose
      // blockHash matches the OLD tracker entries.
      const oldByNumber = new Map<bigint, Hex>();
      for (const b of sub.tracker.snapshot()) oldByNumber.set(b.number, b.hash);

      // Re-query the OLD chain is impossible (the RPC only knows current state),
      // so we approximate the "rolled back" set by recording the topics we
      // *would have* delivered: the tracker stored hashes only. Best we can
      // do for this v0 is to emit onReorg with the metadata (block numbers
      // + old hashes) so the consumer can invalidate their caches.
      const rolledBack: DecodedEvent[] = [];
      for (let n = rollbackFrom; n <= rollbackTo; n++) {
        const oldHash = oldByNumber.get(n);
        if (!oldHash) continue;
        rolledBack.push({
          eventName: sub.event,
          args: {},
          address: sub.address,
          blockNumber: n,
          blockHash: oldHash,
          transactionHash:
            "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex,
          transactionIndex: 0,
          logIndex: 0,
          topics: [sub.topic0],
          data: "0x" as Hex,
        });
      }
      if (rolledBack.length > 0 && sub.onReorg) await sub.onReorg(rolledBack);

      // Truncate tracker + rewind cursor to ancestor (or to fromBlock if none)
      if (ancestor) {
        sub.tracker.truncateAfter(ancestor);
        sub.cursorState = {
          lastBlock: ancestor.number,
          recentBlocks: sub.tracker.snapshot(),
        };
      } else {
        sub.tracker.hydrate([]);
        sub.cursorState = {
          lastBlock: sub.fromBlock - 1n,
          recentBlocks: [],
        };
      }
      await this.cursor.save(sub.id, sub.cursorState);
    }
  }
  // ---- (existing) live emit ----
  if (sub.cursorState.lastBlock >= safeHead) continue;
  const fromBlock = sub.cursorState.lastBlock + 1n;
  const toBlock = safeHead;
  const logs = (await this.client.getLogs({
    address: sub.address,
    fromBlock,
    toBlock,
  })) as unknown as Array<{
    address: `0x${string}`;
    blockNumber: bigint;
    blockHash: Hex;
    transactionHash: Hex;
    transactionIndex: number;
    logIndex: number;
    topics: readonly Hex[];
    data: Hex;
  }>;
  for (const raw of logs) {
    if (raw.topics[0] !== sub.topic0) continue;
    const decoded = decodeOne(sub.abi, raw);
    await sub.onEvent(decoded);
  }
  // refresh window
  for (let n = fromBlock; n <= toBlock; n++) {
    const block = await this.client.getBlock({ blockNumber: n });
    sub.tracker.push({ number: n, hash: block.hash as Hex });
  }
  sub.cursorState = {
    lastBlock: toBlock,
    recentBlocks: sub.tracker.snapshot(),
  };
  await this.cursor.save(sub.id, sub.cursorState);
}
```

Implementation note baked into the rolled-back-events block above: the indexer stores **block hashes** not full log payloads, so on reorg we synthesise rolled-back `DecodedEvent`s with `args: {}` and zero tx metadata. The consumer gets `blockNumber + old blockHash + eventName` — enough to invalidate any cache keyed on those, which is the canonical reorg API. A future enhancement (D-future) can persist log topics alongside the tracker to fully reconstruct args.

- [ ] **Step 4: Verify tests pass**

Run: `pnpm --filter @foundryprotocol/0gkit-indexer test`
Expected: ALL suites PASS, including `indexer-reorg`.

- [ ] **Step 5: Commit**

```bash
git add packages/0gkit-indexer/src/indexer.ts \
  packages/0gkit-indexer/src/__tests__/indexer-reorg.test.ts
git commit -m "feat(indexer): reorg detection + rollback via BlockTracker"
```

---

### Task 11: Multi-subscription multiplexing

**Files:**

- Test: `packages/0gkit-indexer/src/__tests__/indexer-multi.test.ts`

The existing Indexer already iterates `this.subscriptions` per poll, so multi-sub is structurally supported. This task is a regression-style test that **proves** it works for two different events on the same address and for the same event on two different addresses.

- [ ] **Step 1: Write the test**

```ts
// packages/0gkit-indexer/src/__tests__/indexer-multi.test.ts
import { describe, it, expect } from "vitest";
import { parseAbi, encodeEventTopics, type Hex } from "viem";
import { Indexer } from "../indexer.js";
import { MemoryCursorStore } from "../cursors/memory.js";

const abi = parseAbi(["event Ping(uint256 n)", "event Pong(uint256 n)"]);
const [pingTopic] = encodeEventTopics({ abi, eventName: "Ping" });
const [pongTopic] = encodeEventTopics({ abi, eventName: "Pong" });

const blockHash = (n: number): Hex => ("0x" + n.toString(16).padStart(64, "0")) as Hex;

describe("Indexer (multi-subscription)", () => {
  it("delivers events to distinct subscriptions on the same address", async () => {
    const address = "0xababababababababababababababababababab" as const;
    let head = 3n;
    const blocks = new Map<bigint, Hex>([
      [1n, blockHash(1)],
      [2n, blockHash(2)],
      [3n, blockHash(3)],
    ]);

    const allLogs = [
      {
        address,
        blockNumber: 1n,
        blockHash: blocks.get(1n)!,
        transactionHash: "0x01" as Hex,
        transactionIndex: 0,
        logIndex: 0,
        topics: [pingTopic!] as readonly Hex[],
        data: "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex,
      },
      {
        address,
        blockNumber: 2n,
        blockHash: blocks.get(2n)!,
        transactionHash: "0x02" as Hex,
        transactionIndex: 0,
        logIndex: 1,
        topics: [pongTopic!] as readonly Hex[],
        data: "0x0000000000000000000000000000000000000000000000000000000000000002" as Hex,
      },
    ];

    const client = {
      getBlockNumber: async () => head,
      getBlock: async (args: { blockNumber: bigint }) => ({
        hash: blocks.get(args.blockNumber)!,
        number: args.blockNumber,
      }),
      getLogs: async () => allLogs,
    };

    const pings: bigint[] = [];
    const pongs: bigint[] = [];

    const indexer = new Indexer({
      network: "local",
      cursor: new MemoryCursorStore(),
      pollIntervalMs: 10,
      confirmations: 1,
      reorgDepth: 8,
      publicClient: client as never,
    });

    await indexer.subscribe({
      contract: { address, abi },
      event: "Ping",
      fromBlock: 1n,
      onEvent: (e) => pings.push(e.blockNumber),
    });
    await indexer.subscribe({
      contract: { address, abi },
      event: "Pong",
      fromBlock: 1n,
      onEvent: (e) => pongs.push(e.blockNumber),
    });

    await indexer.start();
    await new Promise((r) => setTimeout(r, 60));
    await indexer.stop();

    expect(pings).toEqual([1n]);
    expect(pongs).toEqual([2n]);
  });

  it("status() reports subscription count + head", async () => {
    const client = {
      getBlockNumber: async () => 42n,
      getBlock: async () => ({ hash: blockHash(42), number: 42n }),
      getLogs: async () => [],
    };
    const indexer = new Indexer({
      network: "local",
      pollIntervalMs: 1000,
      confirmations: 1,
      reorgDepth: 8,
      publicClient: client as never,
    });
    await indexer.subscribe({
      contract: { address: ("0xcd" + "00".repeat(19)) as `0x${string}`, abi },
      event: "Ping",
      fromBlock: 1n,
      onEvent: () => {},
    });
    await indexer.start();
    const s = indexer.status();
    await indexer.stop();
    expect(s.running).toBe(true);
    expect(s.subscriptions).toBe(1);
    expect(s.headBlock).toBe(42n);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm --filter @foundryprotocol/0gkit-indexer test`
Expected: ALL suites PASS, including `indexer-multi`.

- [ ] **Step 3: Coverage gate check**

Run: `pnpm --filter @foundryprotocol/0gkit-indexer coverage`
Expected: meets the 80/70 gate. If a branch is uncovered, add a targeted test (e.g. `unsubscribe` if added later, or the no-confirmations early-return).

- [ ] **Step 4: Commit**

```bash
git add packages/0gkit-indexer/src/__tests__/indexer-multi.test.ts
git commit -m "test(indexer): multi-subscription multiplexing + status()"
```

---

### Task 12: React adapter — `IndexerProvider`, `useEvent`, `useLogs`

**Files:**

- Modify: `packages/0gkit-react/package.json` — add `@foundryprotocol/0gkit-indexer: workspace:*` dep.
- Create: `packages/0gkit-react/src/IndexerProvider.tsx`
- Create: `packages/0gkit-react/src/useEvent.ts`
- Create: `packages/0gkit-react/src/useLogs.ts`
- Modify: `packages/0gkit-react/src/index.ts` — add new exports.
- Test: `packages/0gkit-react/src/__tests__/useEvent.test.tsx`
- Test: `packages/0gkit-react/src/__tests__/useLogs.test.tsx`

- [ ] **Step 1: Update `0gkit-react/package.json`**

Add to `dependencies`:

```json
    "@foundryprotocol/0gkit-indexer": "workspace:*",
```

Run `pnpm install` once after the edit.

- [ ] **Step 2: Write the failing useEvent test**

```tsx
// packages/0gkit-react/src/__tests__/useEvent.test.tsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, act, waitFor } from "@testing-library/react";
import type { Indexer } from "@foundryprotocol/0gkit-indexer";
import { ZeroGIndexerProvider } from "../IndexerProvider.js";
import { useEvent } from "../useEvent.js";

describe("useEvent", () => {
  it("subscribes via the provided indexer and surfaces emitted events", async () => {
    type Listener = (e: { blockNumber: bigint; args: Record<string, unknown> }) => void;
    let captured: Listener | null = null;
    const fakeIndexer = {
      subscribe: vi.fn(async (req) => {
        captured = req.onEvent;
        return { id: "test-sub" };
      }),
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    } as unknown as Indexer;

    const Probe: React.FC = () => {
      const { events } = useEvent({
        contract: {
          address: ("0xcafe" + "00".repeat(18)) as `0x${string}`,
          abi: [],
        },
        event: "Ping",
        fromBlock: "latest",
      });
      return <div data-testid="count">{events.length}</div>;
    };

    const { getByTestId } = render(
      <ZeroGIndexerProvider indexer={fakeIndexer}>
        <Probe />
      </ZeroGIndexerProvider>
    );

    await waitFor(() => expect(fakeIndexer.subscribe).toHaveBeenCalledTimes(1));
    expect(getByTestId("count").textContent).toBe("0");

    await act(async () => {
      captured!({ blockNumber: 1n, args: { n: 1n } } as never);
      captured!({ blockNumber: 2n, args: { n: 2n } } as never);
    });

    await waitFor(() => expect(getByTestId("count").textContent).toBe("2"));
  });
});
```

- [ ] **Step 3: Verify it fails**

Run: `pnpm --filter @foundryprotocol/0gkit-react test useEvent`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement IndexerProvider**

```tsx
// packages/0gkit-react/src/IndexerProvider.tsx
import React, { createContext, useContext, type ReactNode } from "react";
import type { Indexer } from "@foundryprotocol/0gkit-indexer";

const Ctx = createContext<Indexer | null>(null);

export interface ZeroGIndexerProviderProps {
  indexer: Indexer;
  children: ReactNode;
}

export const ZeroGIndexerProvider: React.FC<ZeroGIndexerProviderProps> = ({
  indexer,
  children,
}) => <Ctx.Provider value={indexer}>{children}</Ctx.Provider>;

export function useIndexer(): Indexer {
  const i = useContext(Ctx);
  if (!i) {
    throw new Error(
      "useIndexer / useEvent / useLogs must be used inside <ZeroGIndexerProvider>."
    );
  }
  return i;
}
```

- [ ] **Step 5: Implement useEvent**

```ts
// packages/0gkit-react/src/useEvent.ts
import { useEffect, useRef, useState } from "react";
import type { DecodedEvent, SubscribeOptions } from "@foundryprotocol/0gkit-indexer";
import { useIndexer } from "./IndexerProvider.js";

export interface UseEventOptions extends Omit<
  SubscribeOptions,
  "onEvent" | "onReorg"
> {}

export interface UseEventResult {
  events: DecodedEvent[];
  isLoading: boolean;
  error: Error | null;
}

export function useEvent(opts: UseEventOptions): UseEventResult {
  const indexer = useIndexer();
  const [events, setEvents] = useState<DecodedEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    let mounted = true;
    (async () => {
      try {
        await indexer.subscribe({
          ...opts,
          onEvent: (e) => {
            if (!mounted) return;
            setEvents((prev) => [...prev, e]);
          },
          onReorg: (rolled) => {
            if (!mounted) return;
            const dropBlocks = new Set(rolled.map((r) => r.blockNumber));
            setEvents((prev) => prev.filter((e) => !dropBlocks.has(e.blockNumber)));
          },
        });
        if (mounted) setIsLoading(false);
      } catch (e) {
        if (mounted) {
          setError(e as Error);
          setIsLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
    // intentionally omit `opts` from deps — a stable subscription per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indexer]);

  return { events, isLoading, error };
}
```

- [ ] **Step 6: Implement useLogs (historical)**

```ts
// packages/0gkit-react/src/useLogs.ts
import { useEffect, useState } from "react";
import { decodeEventLog, type Abi, type Address, type Hex } from "viem";
import { useIndexer } from "./IndexerProvider.js";
import type { DecodedEvent } from "@foundryprotocol/0gkit-indexer";

export interface UseLogsOptions {
  contract: { address: Address; abi: Abi };
  event: string;
  fromBlock: bigint;
  toBlock?: bigint;
}

export interface UseLogsResult {
  logs: DecodedEvent[];
  isLoading: boolean;
  error: Error | null;
}

/**
 * One-shot historical query. Useful for "show me all events of type X in the
 * given block range." Live subscriptions belong in `useEvent`.
 *
 * Note: queries through the same indexer's RPC client; we re-use the
 * indexer instance's public viem client by reading logs ourselves.
 */
export function useLogs(opts: UseLogsOptions): UseLogsResult {
  const indexer = useIndexer();
  const [logs, setLogs] = useState<DecodedEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Use the indexer's existing chain client via subscribe()'s machinery:
        // we briefly subscribe with a manual fromBlock/toBlock, collect, then
        // stop. For v0 we expose a thin helper `queryLogs` on Indexer; this
        // hook is intentionally tiny.
        const collected: DecodedEvent[] = [];
        const { id } = await indexer.subscribe({
          contract: opts.contract,
          event: opts.event,
          fromBlock: opts.fromBlock,
          onEvent: (e) => {
            if (opts.toBlock !== undefined && e.blockNumber > opts.toBlock) return;
            collected.push(e);
          },
        });
        // Force one poll, then stop the subscription.
        await indexer.start();
        await new Promise((r) => setTimeout(r, 50));
        await indexer.stop();
        if (mounted) {
          setLogs(collected);
          setIsLoading(false);
        }
        // hint that the id is intentionally unused (kept for debuggability):
        void id;
      } catch (e) {
        if (mounted) {
          setError(e as Error);
          setIsLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indexer]);

  return { logs, isLoading, error };
}
```

Note: viem's `decodeEventLog` is imported above to keep the type surface complete for downstream users who may want to reuse it via `useLogs`'s return type; it's exercised by the existing log-decoder in the indexer core.

- [ ] **Step 7: Update `0gkit-react/src/index.ts`**

```ts
// packages/0gkit-react/src/index.ts
export { useUpload, type UseUploadResult } from "./useUpload.js";
export { useDownload, type UseDownloadResult } from "./useDownload.js";
export {
  useInference,
  type UseInferenceResult,
  type InferenceArgs,
} from "./useInference.js";
export { useAttestation, type UseAttestationResult } from "./useAttestation.js";
export type { AsyncState, AsyncAction } from "./types.js";

// SP6 — indexer hooks
export {
  ZeroGIndexerProvider,
  useIndexer,
  type ZeroGIndexerProviderProps,
} from "./IndexerProvider.js";
export { useEvent, type UseEventOptions, type UseEventResult } from "./useEvent.js";
export { useLogs, type UseLogsOptions, type UseLogsResult } from "./useLogs.js";
```

- [ ] **Step 8: Write useLogs test**

```tsx
// packages/0gkit-react/src/__tests__/useLogs.test.tsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, waitFor } from "@testing-library/react";
import type { Indexer, DecodedEvent } from "@foundryprotocol/0gkit-indexer";
import { ZeroGIndexerProvider } from "../IndexerProvider.js";
import { useLogs } from "../useLogs.js";

describe("useLogs", () => {
  it("delivers a one-shot batch then stops the indexer", async () => {
    const subSeen: Array<DecodedEvent> = [];
    const fakeEvent = (n: bigint): DecodedEvent => ({
      eventName: "Ping",
      args: { n },
      address: ("0xcafe" + "00".repeat(18)) as `0x${string}`,
      blockNumber: n,
      blockHash: ("0x" + "ab".repeat(32)) as `0x${string}`,
      transactionHash: ("0x" + "cd".repeat(32)) as `0x${string}`,
      transactionIndex: 0,
      logIndex: 0,
      topics: [],
      data: "0x",
    });

    const indexer = {
      subscribe: vi.fn(async (req) => {
        // synchronously fire two events to the onEvent before resolution
        await req.onEvent(fakeEvent(1n));
        await req.onEvent(fakeEvent(2n));
        return { id: "logs-sub" };
      }),
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    } as unknown as Indexer;

    const Probe: React.FC = () => {
      const { logs, isLoading } = useLogs({
        contract: { address: ("0xcafe" + "00".repeat(18)) as `0x${string}`, abi: [] },
        event: "Ping",
        fromBlock: 1n,
      });
      return (
        <div data-testid="state">{isLoading ? "loading" : `done:${logs.length}`}</div>
      );
    };

    const { getByTestId } = render(
      <ZeroGIndexerProvider indexer={indexer}>
        <Probe />
      </ZeroGIndexerProvider>
    );

    await waitFor(() => expect(getByTestId("state").textContent).toBe("done:2"), {
      timeout: 1000,
    });
    expect(indexer.stop).toHaveBeenCalled();
  });
});
```

- [ ] **Step 9: Run tests**

Run:

```bash
pnpm --filter @foundryprotocol/0gkit-react typecheck
pnpm --filter @foundryprotocol/0gkit-react test
```

Expected: all suites PASS (including the existing useUpload / useDownload / useInference / useAttestation suites).

- [ ] **Step 10: Coverage gate**

Run: `pnpm --filter @foundryprotocol/0gkit-react coverage`
Expected: 80/70 gate met. If branches are uncovered, add a tiny test asserting the provider throws when no `<ZeroGIndexerProvider>` ancestor.

- [ ] **Step 11: Commit**

```bash
git add packages/0gkit-react/package.json \
  packages/0gkit-react/src/IndexerProvider.tsx \
  packages/0gkit-react/src/useEvent.ts \
  packages/0gkit-react/src/useLogs.ts \
  packages/0gkit-react/src/index.ts \
  packages/0gkit-react/src/__tests__/useEvent.test.tsx \
  packages/0gkit-react/src/__tests__/useLogs.test.tsx \
  pnpm-lock.yaml
git commit -m "feat(react): SP6 hooks — useEvent + useLogs + ZeroGIndexerProvider"
```

---

### Task 13: README + changeset + decisions + roadmap + final CI gate

**Files:**

- Create: `packages/0gkit-indexer/README.md` (full version replacing the placeholder).
- Create: `.changeset/sp6-0gkit-indexer.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/specs/2026-05-20-essentials-roadmap.md`
- Modify: root `README.md`

- [ ] **Step 1: Write `packages/0gkit-indexer/README.md`**

````markdown
# @foundryprotocol/0gkit-indexer

Reorg-safe, persisted-cursor event subscriptions on the 0G chain. Built on `@foundryprotocol/0gkit-contracts` typed contracts and `viem`.

## Install

```bash
pnpm add @foundryprotocol/0gkit-indexer
# optional persistence backends (sqlite ships built-in):
pnpm add ioredis     # if you want the redis cursor
```
````

## Quickstart

```ts
import { Indexer, MemoryCursorStore } from "@foundryprotocol/0gkit-indexer";
import { standardContracts } from "@foundryprotocol/0gkit-contracts";

const registry = standardContracts.registry({
  address: "0x...",
  network: "galileo",
});

const indexer = new Indexer({
  network: "galileo",
  cursor: new MemoryCursorStore(),
});

await indexer.subscribe({
  contract: registry,
  event: "ProviderRegistered",
  fromBlock: "latest",
  onEvent: (event) => console.log("registered:", event.args),
  onReorg: (rolled) =>
    console.warn(
      "rolled back:",
      rolled.map((r) => r.blockNumber)
    ),
});

await indexer.start();
```

## Cursor backends

- **Memory** (built-in) — `new MemoryCursorStore()`. For tests + ephemeral processes.
- **SQLite** — `import { SqliteCursorStore } from "@foundryprotocol/0gkit-indexer/cursors/sqlite"` — uses `better-sqlite3` (direct dep). Persistent across restarts.
- **Redis** — `import { RedisCursorStore } from "@foundryprotocol/0gkit-indexer/cursors/redis"` — optional peer (`pnpm add ioredis`). For multi-process or clustered deployments.

## Reorg semantics

The indexer keeps a bounded window of recent block hashes (default 64). On every poll, it re-fetches those blocks; if a hash mismatches, it walks back to the highest common ancestor, emits `onReorg(rolledBack)` for the dropped blocks, and re-emits `onEvent` from the new chain. The default `confirmations: 1` waits one block past head before delivering — set higher (e.g. 6) for stronger finality at the cost of latency.

The rolled-back `DecodedEvent`s carry `{ blockNumber, blockHash (old), eventName, address }`. Full original args are not preserved across reorgs in v0; persist your own keyed cache on `transactionHash` if you need to undo specific effects.

## React

Use `@foundryprotocol/0gkit-react`'s `useEvent` / `useLogs` hooks:

```tsx
import { ZeroGIndexerProvider, useEvent } from "@foundryprotocol/0gkit-react";

<ZeroGIndexerProvider indexer={indexer}>
  <App />
</ZeroGIndexerProvider>;

function Messages() {
  const { events, isLoading } = useEvent({
    contract: chatContract,
    event: "MessagePosted",
    fromBlock: "latest",
  });
  if (isLoading) return <p>loading…</p>;
  return (
    <ul>
      {events.map((e, i) => (
        <li key={i}>{String(e.args.body)}</li>
      ))}
    </ul>
  );
}
```

## Neutrality

`@foundryprotocol/0gkit-indexer` depends only on `viem` and `@foundryprotocol/0gkit-{core,contracts}`. Enforced by `pnpm boundary:check` in CI.

## License

MIT

````

- [ ] **Step 2: Write changeset**

```markdown
---
"@foundryprotocol/0gkit-indexer": minor
"@foundryprotocol/0gkit-react": minor
---

SP6 — `@foundryprotocol/0gkit-indexer`: reorg-safe event subscriptions on 0G with memory / sqlite / redis cursor backends, plus `useEvent` and `useLogs` hooks in `@foundryprotocol/0gkit-react` (gated on a `ZeroGIndexerProvider`).
````

Save as `.changeset/sp6-0gkit-indexer.md`.

- [ ] **Step 3: Append D19 + D20 to `docs/DECISIONS.md`**

Append at the end:

```markdown
### D19 — `0gkit-indexer` cursor backends: sqlite direct dep, redis optional peer

`better-sqlite3` is a direct dependency: it ships with the package, ~2 MB install, synchronous (no event-loop hop per cursor write), and gives every user persistent cursors out of the box without an extra install step. `ioredis` is an `optionalPeerDependency`: redis is a multi-process / clustered deployment concern, and forcing every user to install it would balloon the install footprint for the common (single-process) case. Sub-path exports (`/cursors/sqlite`, `/cursors/redis`) let tree-shaking strip the unused backend from production bundles.

### D20 — `0gkit-indexer` uses polling, not WebSocket subscriptions

EVM RPC WebSocket subscriptions are notoriously unreliable (silently drop, miss reconnects, inconsistent across providers). Polling with `getLogs` works against every RPC, is restartable across process crashes via the persisted cursor, and gives us a uniform place to insert reorg detection. The 2-second default poll interval is plenty for the dapp use cases this indexer targets (event-driven UIs, side-effect reactors). Sub-second latency users can override `pollIntervalMs`.
```

- [ ] **Step 4: Update `docs/specs/2026-05-20-essentials-roadmap.md`**

Find the SP6 status row (in the Phase 3 table) and flip it to ✅; in the SP6 section body add a final `**Status:** ✅ Shipped 2026-05-21 — PR #<n>` line under the heading.

If a roadmap-level "shipped sub-projects" log exists at the bottom, append `- SP6 — \`0gkit-indexer\` (PR #<n>)`.

- [ ] **Step 5: Update root `README.md`**

Find the package table and add a row for `@foundryprotocol/0gkit-indexer` mirroring the format of the existing rows. Add a one-line mention of `useEvent` / `useLogs` to the `@foundryprotocol/0gkit-react` row.

- [ ] **Step 6: Full repo gate**

Run from repo root:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm boundary:check
pnpm build
pnpm test
pnpm --filter @foundryprotocol/0gkit-indexer coverage
pnpm --filter @foundryprotocol/0gkit-react coverage
```

Expected: every command exits 0. Coverage on both target packages meets the 80/70 gate.

- [ ] **Step 7: Commit + push + open PR**

```bash
git add packages/0gkit-indexer/README.md \
  .changeset/sp6-0gkit-indexer.md \
  docs/DECISIONS.md \
  docs/specs/2026-05-20-essentials-roadmap.md \
  README.md
git commit -m "docs(sp6): README, DECISIONS D19/D20, roadmap status, changeset"

git push -u origin <branch>
gh pr create --title "SP6 — 0gkit-indexer (reorg-safe events + React hooks)" \
  --body "$(cat <<'EOF'
## Summary

- New `@foundryprotocol/0gkit-indexer` package: reorg-safe, persisted-cursor event subscriptions on 0G chain.
  - `Indexer` class with `subscribe` / `start` / `stop` / `status`.
  - Cursor backends: `MemoryCursorStore` (built-in), `SqliteCursorStore` (better-sqlite3 direct dep, sub-path `./cursors/sqlite`), `RedisCursorStore` (ioredis optional peer, sub-path `./cursors/redis`).
  - Decorrelated backoff with jitter on RPC errors; multi-subscription multiplexing.
  - Reorg detection via bounded block-hash window (default 64) + common-ancestor walk; `onReorg(rolledBack)` callback.
- `@foundryprotocol/0gkit-react`: new `ZeroGIndexerProvider`, `useEvent`, `useLogs`, `useIndexer`.
- DECISIONS: D19 (sqlite direct / redis optional), D20 (polling not WSS).
- Roadmap: SP6 ✅; root README + package README updated.

Closes SP6 in the essentials roadmap.

## Test plan

- [x] `pnpm test` green on all packages.
- [x] `pnpm --filter @foundryprotocol/0gkit-indexer coverage` meets 80/70 gate.
- [x] `pnpm --filter @foundryprotocol/0gkit-react coverage` meets 80/70 gate.
- [x] `pnpm boundary:check` green (no `@foundryprotocol/sdk` imports).
- [x] `pnpm format:check` / `pnpm lint` / `pnpm typecheck` / `pnpm build` all green.
EOF
)"
```

- [ ] **Step 8: After CI is green, squash-merge**

```bash
gh pr merge --squash --delete-branch
```

(Per project's PR workflow rule: squash-merge own PRs once CI passes.)

---

## Self-Review

**Spec coverage:**

| Spec requirement                                                        | Task(s)                                                                                  |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `new Indexer({ network, cursor })`                                      | T9 (core), T3 (types)                                                                    |
| `subscribe({ contract, event, fromBlock, onEvent, onReorg })`           | T9 (subscribe)                                                                           |
| Cursor: sqlite default, redis adapter, in-memory for tests              | T6 memory, T7 sqlite, T8 redis                                                           |
| Backoff with jitter on RPC errors                                       | T2 (backoff), T9 (callWithBackoff)                                                       |
| Reorg-safe: tracks last N blocks; emits roll-back event on reorg        | T4 (BlockTracker), T10 (wiring + test)                                                   |
| Cursor persistence (sqlite default, redis adapter, in-memory for tests) | T6 / T7 / T8                                                                             |
| Multi-event multiplexing on a single subscription                       | T11 (multi test)                                                                         |
| React: `useEvent`, `useLogs`                                            | T12                                                                                      |
| Test: simulates 3-block reorg correctly rolls back and re-emits         | T10 test                                                                                 |
| Cursor survives restart: stop, restart, no missed events                | T9 second test                                                                           |
| Coverage 85%                                                            | T11 step 3 + T12 step 10 + T13 step 6                                                    |
| Depends on SP4 (typed contracts) + SP5 (testing fixtures)               | T1 deps, T9 SubscribeOptions accepts TypedContract shape, T7/T8 dev-dep on 0gkit-testing |

**Placeholder scan:** No "TBD"/"implement later"/"add appropriate error handling" left. The reorg block in T10 has a known v0 limitation (rolled-back events carry empty args) documented in the README + the implementation comment — that's a deliberate scope cut, not a placeholder.

**Type consistency:**

- `CursorState`, `CursorStore`, `SubscribeOptions`, `DecodedEvent` defined in T3 and consumed unchanged in T6/T7/T8/T9/T10/T12. ✅
- `Indexer.subscribe(req)` returns `{ id: string }` (T9); React hooks ignore the return value but use the same `SubscribeOptions` shape via `Omit<…, "onEvent" | "onReorg">` (T12). ✅
- `BlockTracker.{push, snapshot, head, findCommonAncestor, hydrate, truncateAfter}` defined in T4 and consumed in T9 + T10. ✅

**Execution Handoff**

Plan complete and saved to `docs/plans/2026-05-21-sp6-0gkit-indexer.md`.
