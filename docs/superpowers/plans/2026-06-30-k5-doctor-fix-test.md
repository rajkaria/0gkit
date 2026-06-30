---
title: K5 — `0g doctor --fix` + `0g test` conformance runner
date: 2026-06-30
epic: kits
sprint: K5 (old SP17)
spec: ../specs/2026-06-30-0gkit-kits-design.md
roadmap: 2026-06-30-kits-epic-roadmap.md
status: ready
depends_on: [K0]
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

# K5 — `0g doctor --fix` + `0g test` conformance runner

## Goal

Turn `0g doctor` from a diagnose-only command into a **diagnose-and-repair**
command, and ship a `0g test` conformance runner that round-trips each 0G
primitive against either the local devnet or galileo. After K5:

```bash
0g doctor                 # every failed check now ends with `→ run <cmd> to fix`
0g doctor --fix           # writes .env.example/.env.local, bumps stale 0gkit pins,
                          # prints the exact RPC-fallback command
0g test                   # storage + compute + da + wallet round-trips
0g test --suite=storage,da --local
0g test --kits            # NEW (K0 synergy): runs each applied kit's conformance check
```

`0g test` is the canonical CI step templates adopt in their `package.json`.

## Dependencies / Architecture

- **`0g doctor --fix`** extends the existing diagnose-only command
  ([packages/0gkit-cli/src/commands/doctor.ts](../../../packages/0gkit-cli/src/commands/doctor.ts)).
  Every `Check` gains a `fixCmd?: string` (the command that repairs it) and an
  optional `fix?: () => Promise<string>` applied only when `--fix` is passed.
  The three fixers:
  1. **Missing `.env`** → render `.env.example` + `.env.local` from a project's
     `define0GConfig` (the `envExample()` method already exists in
     [packages/0gkit-core/src/define-config.ts](../../../packages/0gkit-core/src/define-config.ts)).
  2. **Stale `@foundryprotocol/0gkit-*` pins** → emit the `npm install` line that
     bumps them to the latest published version (read from the registry).
  3. **Unreachable galileo RPC/indexer/encoder** → print the exact `0g dev`
     local-fallback command. No behaviour gated on Aristotle (D10): galileo +
     local always work.
- **`0g test`** is a new command group that **lazy-imports `0gkit-testing`** via a
  computed dynamic specifier (D39) so the CLI cold-start budget is untouched.
  `0gkit-testing` already ships `mockStorageClient`/`mockDAClient`/`testWallet`
  ([packages/0gkit-testing/src/index.ts](../../../packages/0gkit-testing/src/index.ts));
  this sprint adds a `conformance` module to it with one round-trip per suite.
- **`--kits` synergy (K0):** `0g test --kits` reads applied kits from the project
  (`.0gkit/kits.json`, written by `applyKit`'s `ApplyResult` in K0) and runs each
  kit's `conformance.ts` if present. Pure additive — falls back to a no-op note
  when no kits are applied.
- Both commands are dependency-injected through `ProgramDeps`
  ([packages/0gkit-cli/src/program.ts](../../../packages/0gkit-cli/src/program.ts))
  so they are testable without a live network — exactly as `doctor`'s `fetch` and
  `dev`'s `devnet` factory already are.

## Tech Stack

TypeScript (ESM, `"import"`-only exports per D68), tsup, vitest, commander, zod.
Lazy `0gkit-testing` import via computed specifier (D39). pnpm + turbo. Changesets.

## Working dir / Branch

- Working dir: `/Users/rajkaria/Projects/0G-ai-kit`
- Branch: `kits-k5-doctor-fix-test` off `main`

## File structure

**Created**

```
packages/0gkit-testing/src/conformance/
  index.ts                 # runConformance(), SuiteName, SuiteResult
  storage.ts               # upload 1KB → download → assert byte-equality
  compute.ts               # 4-token prompt → assert non-empty output
  da.ts                    # publish → verify digest round-trip
  wallet.ts                # sign → recover a test envelope
  __tests__/conformance.test.ts
packages/0gkit-cli/src/commands/test.ts          # registerTest(program) — 0g test
packages/0gkit-cli/src/commands/doctor-fix.ts    # the three fixer fns (pure, injectable)
packages/0gkit-cli/src/__tests__/doctor-fix.test.ts
packages/0gkit-cli/src/__tests__/test-command.test.ts
```

**Modified**

```
packages/0gkit-testing/src/index.ts              # export conformance surface
packages/0gkit-cli/src/commands/doctor.ts        # Check.fixCmd + --fix flag + fixers
packages/0gkit-cli/src/program.ts                # registerTest(program) + test deps
packages/0gkit-cli/src/__tests__/program.test.ts # `0g test` registered
templates/*/package.json                          # "test": "0g test" canonical CI step (9 templates)
apps/docs/app/packages/0gkit-testing/page.mdx     # conformance + `0g test` docs
.changeset/k5-doctor-fix-test.md                  # testing minor + cli minor
docs/DECISIONS.md                                 # D81–D83
```

## Task graph

```
T1 conformance suites (storage/compute/da/wallet) ──┐
                                                     ▼
                                          T2 runConformance()
                                                     │
                          ┌──────────────────────────┴───────────┐
                          ▼                                       ▼
                  T3 0g test command                     T4 doctor fixers
                  (lazy-import, D39)                      (.env / pins / rpc)
                          │                                       │
                          ▼                                       ▼
                  T5 0g test --kits synergy            T6 doctor --fix wiring
                          └──────────────────────────┬───────────┘
                                                     ▼
                              T7 templates adopt `0g test` + docs
                                                     ▼
                              T8 changeset + D81–D83 + full gate
```

---

## Tasks

### T1 — conformance suites in `0gkit-testing`

- [ ] **Failing test** — `packages/0gkit-testing/src/conformance/__tests__/conformance.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { storageSuite } from "../storage.js";
import { mockStorageClient } from "../../mocks/storage.js";

describe("storageSuite", () => {
  it("round-trips 1KB and asserts byte-equality", async () => {
    const storage = mockStorageClient();
    const result = await storageSuite({ makeStorage: () => storage });
    expect(result.ok).toBe(true);
    expect(result.name).toBe("storage");
    expect(result.detail).toContain("1024 bytes");
  });
});
```

- [ ] **Run** — `pnpm --filter @foundryprotocol/0gkit-testing test` → red.
- [ ] **Implement** — `src/conformance/storage.ts`:

```ts
import type { SuiteResult, SuiteDeps } from "./index.js";

const ONE_KB = new Uint8Array(1024).map((_, i) => i % 256);

export async function storageSuite(deps: SuiteDeps): Promise<SuiteResult> {
  const storage = deps.makeStorage();
  const { root } = await storage.upload(ONE_KB);
  const back = await storage.download(root);
  const equal = back.length === ONE_KB.length && back.every((b, i) => b === ONE_KB[i]);
  return {
    name: "storage",
    ok: equal,
    detail: equal
      ? `uploaded + downloaded 1024 bytes, root ${root.slice(0, 10)}…`
      : `byte mismatch: sent 1024, got ${back.length}`,
  };
}
```

Then `compute.ts` (4-token prompt → assert non-empty `output`), `da.ts`
(`publish` → `verify(payload, digest) === true`), `wallet.ts` (sign a test
envelope via `testWallet()` → `recoverAddress` matches the signer). Each is a
pure function over an injected factory so no suite dials a real network.

- [ ] **Run** → green. **Commit**: `feat(testing): storage/compute/da/wallet conformance suites`.

### T2 — `runConformance()` orchestrator + exports

- [ ] **Failing test** — `conformance.test.ts`: `runConformance({ suites: ["storage","da"], deps })` returns two `SuiteResult`s in order; an unknown suite name throws a typed `ConfigError`; `runConformance()` with no `suites` runs all four.
- [ ] **Run** → red.
- [ ] **Implement** — `src/conformance/index.ts`:

```ts
import { ConfigError } from "@foundryprotocol/0gkit-core";
import { storageSuite } from "./storage.js";
import { computeSuite } from "./compute.js";
import { daSuite } from "./da.js";
import { walletSuite } from "./wallet.js";

export const SUITE_NAMES = ["storage", "compute", "da", "wallet"] as const;
export type SuiteName = (typeof SUITE_NAMES)[number];

export interface SuiteResult {
  name: string;
  ok: boolean;
  detail: string;
}
export interface SuiteDeps {
  makeStorage: () => {
    upload: (b: Uint8Array) => Promise<{ root: string }>;
    download: (r: string) => Promise<Uint8Array>;
  };
  makeCompute: () => {
    inference: (a: {
      messages: { role: string; content: string }[];
    }) => Promise<{ output: string }>;
  };
  makeDA: () => {
    publish: (b: Uint8Array) => Promise<{ digest: string }>;
    verify: (b: Uint8Array, d: string) => boolean;
  };
  testWallet: () => { address: string; sign: (digest: string) => Promise<string> };
}

const RUNNERS: Record<SuiteName, (d: SuiteDeps) => Promise<SuiteResult>> = {
  storage: storageSuite,
  compute: computeSuite,
  da: daSuite,
  wallet: walletSuite,
};

export async function runConformance(opts: {
  suites?: SuiteName[];
  deps: SuiteDeps;
}): Promise<SuiteResult[]> {
  const suites = opts.suites ?? [...SUITE_NAMES];
  for (const s of suites) {
    if (!(s in RUNNERS))
      throw new ConfigError(
        `Unknown test suite '${s}'.`,
        `Use a comma list of: ${SUITE_NAMES.join(", ")}.`
      );
  }
  return Promise.all(suites.map((s) => RUNNERS[s](opts.deps)));
}
```

Add to `src/index.ts`: `export { runConformance, SUITE_NAMES, type SuiteName, type SuiteResult, type SuiteDeps } from "./conformance/index.js";`

- [ ] **Run** → green. **Commit**: `feat(testing): runConformance() orchestrator + exports`.

### T3 — `0g test` command (lazy-imports `0gkit-testing`, D39)

- [ ] **Failing test** — `packages/0gkit-cli/src/__tests__/test-command.test.ts`: `0g test --suite=storage,da --local` calls an injected `runConformance` once with `{ suites:["storage","da"] }`; default (`0g test`) runs all four; `--galileo` is the default network path; a failing suite sets `process.exitCode = 1`.
- [ ] **Run** → red.
- [ ] **Implement** — `packages/0gkit-cli/src/commands/test.ts`:

```ts
import type { Command } from "commander";
import { ConfigError } from "@foundryprotocol/0gkit-core";
import { runCommand, type ProgramDeps } from "../program.js";

export function registerTest(program: Command, deps: ProgramDeps): void {
  program
    .command("test")
    .description("conformance: round-trip storage/compute/da/wallet on local|galileo")
    .option("--suite <list>", "comma list: storage,compute,da,wallet (default: all)")
    .option("--local", "use the running `0g dev` stack")
    .option("--galileo", "use the live galileo testnet (default)")
    .option("--kits", "also run each applied kit's conformance check")
    .action(async function (this: Command) {
      const opts = this.opts() as {
        suite?: string;
        local?: boolean;
        galileo?: boolean;
        kits?: boolean;
      };
      await runCommand(deps, this, async (ctx) => {
        // D39: computed specifier keeps `0gkit-testing` out of cold-start.
        const mod = await import(/* @vite-ignore */ "@foundryprotocol/0gkit-testing");
        const suites = opts.suite
          ? opts.suite.split(",").map((s) => s.trim())
          : undefined;
        const results = await mod.runConformance({
          suites,
          deps: deps.conformanceDeps({ network: ctx.network, local: opts.local }),
        });
        const failed = results.filter((r: { ok: boolean }) => !r.ok);
        if (failed.length) process.exitCode = 1;
        const kitNotes = opts.kits ? await deps.runKitConformance(deps.cwd()) : [];
        return {
          human: [
            `0g test — network ${opts.local ? "local" : ctx.network}`,
            ...results.map(
              (r: { ok: boolean; name: string; detail: string }) =>
                `  ${r.ok ? "✓" : "✗"} ${r.name}: ${r.detail}`
            ),
            ...kitNotes,
            failed.length
              ? `${failed.length} suite(s) failed`
              : "all conformance suites passed",
          ],
          json: { network: ctx.network, results, kits: kitNotes },
        };
      });
    });
}
```

Wire `conformanceDeps`, `runKitConformance`, and `registerTest(program, deps)` into `program.ts` (default `conformanceDeps` builds real `Storage`/`Compute`/`DA` factories; `local` swaps RPC to `http://127.0.0.1:8545`). Register after `registerCost`. `ConfigError` import keeps the unknown-suite path typed.

- [ ] **Run** → green. **Commit**: `feat(cli): 0g test conformance runner (lazy-imports 0gkit-testing, D39)`.

### T4 — doctor fixers (`.env` / stale pins / RPC fallback)

- [ ] **Failing test** — `packages/0gkit-cli/src/__tests__/doctor-fix.test.ts`: `genEnvFromConfig` writes `.env.example` + `.env.local` from an injected `define0GConfig` and is idempotent (re-run writes identical bytes); `bumpStalePins` returns the `npm install` line only for pins below the latest registry version; `rpcFallbackCmd("galileo")` returns the exact `0g dev` command string.
- [ ] **Run** → red.
- [ ] **Implement** — `packages/0gkit-cli/src/commands/doctor-fix.ts`:

```ts
export interface DoctorFixDeps {
  fs: {
    exists: (p: string) => Promise<boolean>;
    writeFile: (p: string, d: string) => Promise<void>;
  };
  loadProjectConfig: (cwd: string) => Promise<{ envExample: () => string } | null>;
  readProjectPins: (cwd: string) => Promise<Record<string, string>>;
  latestVersion: (pkg: string) => Promise<string>;
}

export async function genEnvFromConfig(
  cwd: string,
  deps: DoctorFixDeps
): Promise<string | null> {
  const cfg = await deps.loadProjectConfig(cwd);
  if (!cfg) return null;
  const body = cfg.envExample();
  await deps.fs.writeFile(`${cwd}/.env.example`, body);
  if (!(await deps.fs.exists(`${cwd}/.env.local`)))
    await deps.fs.writeFile(`${cwd}/.env.local`, body);
  return "wrote .env.example + .env.local from define0GConfig";
}

export async function bumpStalePins(
  cwd: string,
  deps: DoctorFixDeps
): Promise<string | null> {
  const pins = await deps.readProjectPins(cwd);
  const stale: string[] = [];
  for (const [pkg, pin] of Object.entries(pins)) {
    if (!pkg.startsWith("@foundryprotocol/0gkit-")) continue;
    const latest = await deps.latestVersion(pkg);
    if (pin.replace(/^[\^~]/, "") < latest) stale.push(`${pkg}@latest`);
  }
  return stale.length ? `npm install ${stale.join(" ")}` : null;
}

export function rpcFallbackCmd(network: string): string {
  return `0g dev   # then re-run with --network local (galileo ${network} RPC unreachable)`;
}
```

- [ ] **Run** → green. **Commit**: `feat(cli): doctor fixers — .env gen, stale-pin bump, rpc fallback`.

### T5 — `0g test --kits` synergy (K0)

- [ ] **Failing test** — `test-command.test.ts`: with a stub `runKitConformance` returning `["  ✓ agent-memory: remember→recall ok"]`, `0g test --kits` includes that line; with no applied kits the note reads `no kits applied — run \`0g add <kit>\``.
- [ ] **Run** → red.
- [ ] **Implement** — `runKitConformance(cwd)` in `program.ts` deps: read `.0gkit/kits.json` (the K0 `ApplyResult` manifest); for each applied kit, dynamic-import `./0gkit/kits/<kit>/conformance.ts` if it exists and collect its `ok`/`detail`; otherwise emit the no-kits note. Pure additive; no kit present ⇒ single informational line, never a failure.
- [ ] **Run** → green. **Commit**: `feat(cli): 0g test --kits runs applied-kit conformance (K0 synergy)`.

### T6 — `doctor --fix` wiring + `→ run <cmd>` on every check

- [ ] **Failing test** — extend `program.test.ts` doctor coverage: every failed `Check` renders a `→ run <fixCmd>` line even without `--fix`; with `--fix`, the injected fixers run and their result strings are appended; `--json` includes `fixCmd` per check.
- [ ] **Run** → red.
- [ ] **Implement** — in `doctor.ts`: add `fixCmd?: string` + `fix?: () => Promise<string>` to `Check`; populate `fixCmd` for the rpc/signer/indexer/encoder checks (e.g. rpc-unreachable → `rpcFallbackCmd(ctx.network)`, missing-env synthesized check → `0g doctor --fix`); add a `--fix` flag; when set, run each failed check's `fix()` (delegating to the T4 fixers) and append the result lines. Render `→ run <fixCmd> to fix` for every non-ok check (replacing the current hint-only line where a `fixCmd` exists).
- [ ] **Run** → green. **Commit**: `feat(cli): doctor --fix + every check prints `→ run <cmd> to fix``.

### T7 — templates adopt `0g test` + docs

- [ ] **Implement** — every template's `package.json` (`templates/*/package.json`, 9 templates) gets `"test": "0g test"` as the canonical CI step (or `0g test --local` where the template ships a `0g dev` dev-loop). Update `apps/docs/app/packages/0gkit-testing/page.mdx` with a "Conformance + `0g test`" section: suite list, `--suite`/`--local`/`--galileo`/`--kits` flags, and the `0g doctor --fix` repair table.
- [ ] **Run** — `pnpm docs:check` + `pnpm templates:check` → green.
- [ ] **Commit**: `docs(testing): 0g test + doctor --fix; templates adopt `0g test` CI step`.

### T8 — changeset + decisions + full gate

- [ ] **Implement** — `.changeset/k5-doctor-fix-test.md`: `@foundryprotocol/0gkit-testing` minor (conformance surface) + `0gkit-cli` minor (`0g test`, `doctor --fix`).
- [ ] **Implement** — `docs/DECISIONS.md` D81–D83:
  - **D81** — `0g test` lazy-imports `0gkit-testing` via computed specifier (D39); conformance suites are pure functions over injected factories so they run offline in CI and never gate on Aristotle (D10).
  - **D82** — `0g doctor --fix` only ever writes `.env*`, prints an `npm install` line for stale `@foundryprotocol/0gkit-*` pins, and prints the `0g dev` fallback command — it never auto-installs or mutates network state. Every check exposes a `fixCmd` shown with or without `--fix`.
  - **D83** — `0g test --kits` is additive: reads `.0gkit/kits.json` (K0 `ApplyResult`); no applied kits ⇒ informational note, never a failure.
- [ ] **Run** — full gate: `pnpm lint typecheck build test boundary:check templates:check format:check` → all green. (`0gkit-testing` imports `0gkit-core` only; no neutrality breach.)
- [ ] **Commit**: `chore(k5): changeset + D81–D83`. Open PR `K5 — doctor --fix + 0g test`. Squash-merge on green CI.

## Self-review checklist

- [ ] `0g test` adds nothing to CLI cold-start (`0gkit-testing` dynamic-imported; `0g --help` benchmark unchanged).
- [ ] Every conformance suite runs offline against mocks in CI; no suite dials a live network unless `--galileo` is explicit.
- [ ] `0g doctor --fix` is idempotent — re-running writes identical `.env*` and proposes no churn.
- [ ] Every doctor check renders `→ run <cmd> to fix` (or `ok`); `--json` carries `fixCmd`.
- [ ] `--local` uses `0g dev` infra; `--galileo`/default uses galileo; no path requires Aristotle (D10).
- [ ] `0g test --kits` degrades to a single note when no kits are applied (no false failure).
- [ ] Changeset covers `0gkit-testing` + `0gkit-cli`; D81–D83 recorded.
- [ ] No `@foundryprotocol/*`-app import added to any `0gkit-*` package (boundary:check green).
