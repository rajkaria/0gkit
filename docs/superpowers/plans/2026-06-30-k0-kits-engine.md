---
title: K0 — 0gkit Kits engine + agent-memory reference kit
date: 2026-06-30
epic: kits
sprint: K0 (proposed SP17)
spec: ../specs/2026-06-30-0gkit-kits-design.md
status: ready
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

# K0 — Kits engine + `agent-memory` reference kit

## Goal

Ship the **engine** that makes 0gkit Kits work, end-to-end, proven by one
lib-only reference kit (`agent-memory`) that applies cleanly across React, MCP,
and Node bases. After K0: `npm create 0gkit-app -- --kits agent-memory` and
`0g add agent-memory` both work and are CI-gated by a new `(kit × base)` matrix.

## Architecture

- **New package `@foundryprotocol/0gkit-kits`** — pure overlay engine. Deps:
  `giget`, `zod` only. Must NOT import any other `0gkit-*`/`@foundryprotocol/*`
  package (neutrality + CLI cold-start, D39). Mirrors how `fetchCi()` already
  overlays `templates/_ci/<choice>` ([packages/create-0g-app/src/templates.ts](../../../packages/create-0g-app/src/templates.ts)).
- **Kits live as git overlays** under `templates/_kits/<kit>/` in `rajkaria/0gkit`,
  fetched via `giget` at the same `OGKIT_TEMPLATE_REF`.
- **Two consumers** of the engine: `create-0g-app` (scaffold-time multiselect +
  `--kits` flag) and `0gkit-cli` (`0g add`, `0g kits list|info`, lazy-loaded).
- **3-tier kit model**: `lib/` (portable, always applied) + `adapters/<base>/`
  (per-framework, applied if present) + `ui/` (React bases only).

## Tech Stack

TypeScript (ESM, `"import"`-only exports per D68), tsup build, vitest, zod,
giget. pnpm workspace + turbo. Changesets for versioning.

## Working dir / Branch

- Working dir: `/Users/rajkaria/Projects/0G-ai-kit`
- Branch: `kits-epic` (spec already committed here; K0 implementation continues on it)

## File structure

**Created**

```
packages/0gkit-kits/
  package.json
  tsconfig.json
  tsup.config.ts
  src/
    index.ts                 # public exports
    manifest.ts              # KitManifestSchema (zod) + types
    registry.ts              # listKits(), getKit(), loadRegistry()
    apply.ts                 # applyKit(), resolveTiers()
    merge.ts                 # mergePackageJson(), appendEnv()
    fetch.ts                 # giget overlay fetch (mirrors fetchCi)
    bases.ts                 # base detection + React-capable set
    __tests__/
      manifest.test.ts
      registry.test.ts
      apply.test.ts
      merge.test.ts
templates/_kits/
  agent-memory/
    kit.json
    lib/agent-memory.ts
    adapters/mcp-agent/src/tools/memory.ts
    adapters/react-app/app/api/memory/route.ts
    ui/components/MemoryPanel.tsx
    ui/hooks/useAgentMemory.ts
scripts/check-kits.mjs        # pnpm kits:check matrix harness
scripts/__tests__/check-kits.test.mjs
```

**Modified**

```
pnpm-workspace.yaml                         # (no change — packages/* already globbed; templates/_kits NOT a workspace, per D24)
package.json                                # add "kits:check" script
.dependency-cruiser.cjs                     # forbid 0gkit-kits → other 0gkit-*/@foundryprotocol/*; forbid templates/_kits → @foundryprotocol/*
turbo.json                                  # 0gkit-kits in build/test pipeline (inherited via packages/*)
packages/create-0g-app/src/types.ts         # add `kits?: string[]` to CreateOptions
packages/create-0g-app/src/index.ts         # --kits flag + post-template applyKit loop
packages/create-0g-app/src/prompts.ts       # kits multiselect (compatible-with-base)
packages/create-0g-app/package.json         # dep on @foundryprotocol/0gkit-kits
packages/0gkit-cli/src/program.ts           # registerKits(program)
packages/0gkit-cli/src/commands/kits.ts     # NEW: 0g add / 0g kits list|info (lazy-load engine)
packages/0gkit-cli/package.json             # (no static dep — engine is dynamic-imported per D39)
.github/workflows/fresh-machine-smoke.yml   # add kits:check job
.changeset/kits-engine.md                   # new pkg + create-0g-app minor + cli minor
docs/DECISIONS.md                           # D77–D80
```

## Task graph

```
T1 manifest schema ─┬─ T2 merge utils ──┐
                    ├─ T3 fetch overlay ─┤
                    └─ T4 bases ─────────┤
                                         ▼
                              T5 registry ── T6 applyKit
                                                  │
                          ┌───────────────┬───────┴───────┐
                          ▼               ▼               ▼
                  T7 agent-memory   T8 create-0g-app  T9 0g CLI
                     kit overlay       wiring            wiring
                          └───────────────┴───────┬───────┘
                                                  ▼
                                        T10 kits:check matrix
                                                  ▼
                                  T11 boundary + CI + changeset + decisions
```

---

## Tasks

### Task 1 — Kit manifest schema

- [ ] **Failing test** — `src/__tests__/manifest.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { KitManifestSchema } from "../manifest.js";

describe("KitManifestSchema", () => {
  it("accepts a minimal lib-only kit", () => {
    const m = KitManifestSchema.parse({
      name: "agent-memory",
      title: "Agent Memory",
      domain: "agent-infra",
      summary: "Persistent agent memory on 0G Storage.",
      compatibleBases: ["react-app", "mcp-agent", "storage-app"],
      tiers: { lib: ["lib/agent-memory.ts"] },
    });
    expect(m.name).toBe("agent-memory");
    expect(m.tiers.adapters).toBeUndefined();
  });

  it("rejects a kit whose name is not kebab-case", () => {
    expect(() =>
      KitManifestSchema.parse({
        name: "Agent Memory",
        title: "x",
        domain: "agent-infra",
        summary: "x",
        compatibleBases: ["react-app"],
        tiers: { lib: ["lib/a.ts"] },
      })
    ).toThrow();
  });
});
```

- [ ] **Run** — `pnpm --filter @foundryprotocol/0gkit-kits test` → red.
- [ ] **Implement** — `src/manifest.ts`:

```ts
import { z } from "zod";

export const KIT_DOMAINS = [
  "verifiable-ai",
  "agent-infra",
  "markets",
  "assets",
  "defi",
] as const;

const kebab = z.string().regex(/^[a-z][a-z0-9-]*$/, "must be kebab-case");

export const KitManifestSchema = z.object({
  name: kebab,
  title: z.string().min(1),
  domain: z.enum(KIT_DOMAINS),
  summary: z.string().min(1),
  compatibleBases: z.array(z.string().min(1)).min(1),
  tiers: z.object({
    lib: z.array(z.string()).default([]),
    adapters: z.record(z.string(), z.array(z.string())).optional(),
    ui: z.array(z.string()).optional(),
  }),
  env: z
    .array(
      z.object({
        key: z.string(),
        example: z.string().default(""),
        note: z.string().optional(),
      })
    )
    .default([]),
  dependencies: z.record(z.string(), z.string()).default({}),
  devDependencies: z.record(z.string(), z.string()).default({}),
  requires: z.array(z.string()).default([]), // 0gkit-* pkgs the base must have
  composes: z.array(z.string()).default([]), // other kits auto-applied first
  conflicts: z.array(z.string()).default([]),
});

export type KitManifest = z.infer<typeof KitManifestSchema>;
export type KitDomain = (typeof KIT_DOMAINS)[number];
```

- [ ] **Run** → green. **Commit**: `feat(kits): KitManifestSchema`.

### Task 2 — package.json merge + env append utils

- [ ] **Failing test** — `src/__tests__/merge.test.ts`: assert `mergePackageJson` adds deps without clobbering existing higher versions, and `appendEnv` is idempotent (re-applying the same keys does not duplicate lines).

```ts
import { mergePackageJson, appendEnv } from "../merge.js";
it("merges deps, keeps existing", () => {
  const out = mergePackageJson(
    { dependencies: { a: "^1.0.0" } },
    { dependencies: { a: "^1.0.0", b: "^2.0.0" } }
  );
  expect(out.dependencies).toEqual({ a: "^1.0.0", b: "^2.0.0" });
});
it("appendEnv is idempotent", () => {
  const first = appendEnv("FOO=1\n", [{ key: "BAR", example: "2", note: "n" }]);
  const second = appendEnv(first, [{ key: "BAR", example: "2", note: "n" }]);
  expect(first).toBe(second);
  expect(first).toContain("# n\nBAR=2");
});
```

- [ ] **Run** → red.
- [ ] **Implement** — `src/merge.ts`: deep-merge `dependencies`/`devDependencies`/`scripts` (existing wins on conflict), and `appendEnv(current, vars)` that appends `# note\nKEY=example` blocks only for keys not already present (regex `^KEY=` per line).
- [ ] **Run** → green. **Commit**: `feat(kits): package.json merge + idempotent env append`.

### Task 3 — giget overlay fetch

- [ ] **Failing test** — `src/__tests__/apply.test.ts` (fetch portion, mocked): inject a fake `fetchOverlay` and assert `applyKit` calls it with `github:rajkaria/0gkit/templates/_kits/<name>#<ref>` and `force:true` into a temp dir. (Mirror the `fetchCi` contract.)
- [ ] **Run** → red.
- [ ] **Implement** — `src/fetch.ts`:

```ts
import { downloadTemplate } from "giget";
const REPO = "rajkaria/0gkit";
const REF = process.env.OGKIT_TEMPLATE_REF ?? "main";
export async function fetchKitOverlay(name: string, dir: string): Promise<void> {
  await downloadTemplate(`github:${REPO}/templates/_kits/${name}#${REF}`, {
    dir,
    force: true,
    install: false,
  });
}
```

- [ ] **Run** → green (against the injected mock). **Commit**: `feat(kits): giget kit overlay fetch`.

### Task 4 — base detection + React-capable set

- [ ] **Failing test** — `src/__tests__/registry.test.ts` (bases portion): `detectBase(dir)` returns `"react-app"` for a dir whose package.json deps include `next`, `"mcp-agent"` when it includes `@modelcontextprotocol/sdk`, `"node"` fallback otherwise; `isReactBase("chat")===true`, `isReactBase("tee-attested-api")===false`.
- [ ] **Run** → red.
- [ ] **Implement** — `src/bases.ts`: `REACT_BASES = new Set(["react-app","chat"])`; `isReactBase(b)`; `detectBase(dir)` reads `package.json` + checks for `0g.config.ts`.
- [ ] **Run** → green. **Commit**: `feat(kits): base detection + react-capable set`.

### Task 5 — registry (load + list + compat filter)

- [ ] **Failing test** — `registry.test.ts`: `listKits({ base: "tee-attested-api" })` excludes UI-only kits with no adapter for that base; `listKits()` returns all; `getKit("agent-memory")` returns its manifest.
- [ ] **Run** → red.
- [ ] **Implement** — `src/registry.ts`: registry is a static manifest list embedded at build time (read from `templates/_kits/*/kit.json` via a generated `registry.generated.ts`, produced by a `prebuild` step so the engine ships self-contained and offline-listable). `listKits({base})` filters: keep kit iff `base ∈ compatibleBases` AND `resolveTiers(kit, base)` is non-empty (lib present, or adapter for base, or React UI on a React base).
- [ ] **Run** → green. **Commit**: `feat(kits): kit registry + compatibility filter`.

### Task 6 — applyKit + resolveTiers + composition

- [ ] **Failing test** — `apply.test.ts`: applying a kit with `composes:["dep-kit"]` into a temp project applies `dep-kit` first; `dependencies` land in package.json; env vars appended; re-apply is idempotent; a conflicting kit (`conflicts`) throws a typed error.
- [ ] **Run** → red.
- [ ] **Implement** — `src/apply.ts`:

```ts
export interface ApplyResult {
  applied: string[]; // kit names applied (incl. composed)
  filesWritten: string[];
  envAdded: string[];
  notes: string[];
  token: "[0gkit:kit-applied]";
}
export function resolveTiers(m: KitManifest, base: string): string[] {
  const files = [...(m.tiers.lib ?? [])];
  if (m.tiers.adapters?.[base]) files.push(...m.tiers.adapters[base]);
  if (m.tiers.ui && isReactBase(base)) files.push(...m.tiers.ui);
  return files;
}
export async function applyKit(opts: {
  kit: string;
  dest: string;
  base: string;
  pm: string;
  dryRun?: boolean;
  deps?: ApplyDeps; // injectable fetch/fs for tests
}): Promise<ApplyResult> {
  /* compose → fetch overlay to temp → copy resolved
  tiers into dest → mergePackageJson → appendEnv → collect notes → token */
}
```

Conflict + missing-`requires` checks throw `KitError` (typed, with a code).

- [ ] **Run** → green. **Commit**: `feat(kits): applyKit with tier resolution + composition`.

### Task 7 — `agent-memory` reference kit overlay

- [ ] **Implement** — `templates/_kits/agent-memory/`:
  - `kit.json`: `domain:"agent-infra"`, `compatibleBases:["react-app","chat","storage-app","mcp-agent"]`, `tiers.lib:["lib/agent-memory.ts"]`, `tiers.adapters:{ "mcp-agent":["src/tools/memory.ts"], "react-app":["app/api/memory/route.ts"] }`, `tiers.ui:["components/MemoryPanel.tsx","hooks/useAgentMemory.ts"]`, `requires:["0gkit-storage"]`.
  - `lib/agent-memory.ts` — **portable core**: `createMemory({ storage, namespace })` → `{ remember(key, value), recall(query), list() }` backed by 0G Storage (append-only JSONL blob per namespace + in-memory keyword index on read). Imports `@foundryprotocol/0gkit-storage` (allowed: the _kit overlay_ may import 0gkit packages; only the _engine_ may not).
  - `adapters/mcp-agent/src/tools/memory.ts` — registers `memory_remember` / `memory_recall` MCP tools.
  - `adapters/react-app/app/api/memory/route.ts` — Next route handler (GET recall, POST remember).
  - `ui/hooks/useAgentMemory.ts` + `ui/components/MemoryPanel.tsx` — React hook + panel.
- [ ] **Test** — a vitest in the kit's lib verifying `remember`→`recall` round-trip against a mock storage.
- [ ] **Commit**: `feat(kits): agent-memory reference kit (lib + mcp/react adapters + ui)`.

### Task 8 — create-0g-app scaffold wiring

- [ ] **Failing test** — `packages/create-0g-app/src/__tests__`: with injected deps, `run(["my-app","--template","react-app","--kits","agent-memory"])` calls `applyKit` once with `{kit:"agent-memory", base:"react-app"}`; invalid `--kits foo` errors early like an invalid `--template`.
- [ ] **Run** → red.
- [ ] **Implement** — add `kits?: string[]` to `CreateOptions` (types.ts); parse `--kits a,b` in index.ts; after template fetch, loop `applyKit`; interactive `prompts.ts` adds a multiselect from `listKits({ base: chosenTemplate })`. Inject the engine via `RunDeps.applyKit` for testability (default = real `applyKit`).
- [ ] **Run** → green. **Commit**: `feat(create-0g-app): --kits flag + scaffold-time kit picker`.

### Task 9 — `0g add` / `0g kits` CLI wiring

- [ ] **Failing test** — `packages/0gkit-cli/src/__tests__/program.test.ts`: `0g kits list` prints compatible kits for the detected base; `0g add agent-memory` calls the (lazy-loaded, injected) engine `applyKit` with the cwd as dest; `0g kits info agent-memory` prints summary + tiers + env.
- [ ] **Run** → red.
- [ ] **Implement** — `commands/kits.ts` `registerKits(program)`: subcommands `add <kit...>`, `kits list [--base]`, `kits info <kit>`. Engine imported via computed dynamic specifier (D39). Base auto-detected via `detectBase(process.cwd())`, overridable with `--base`. Register in `program.ts`.
- [ ] **Run** → green. **Commit**: `feat(cli): 0g add + 0g kits list|info`.

### Task 10 — `kits:check` (kit × base) matrix harness

- [ ] **Failing test** — `scripts/__tests__/check-kits.test.mjs`: harness enumerates `(kit, base)` from each `kit.json`'s `compatibleBases`, and (with a stub scaffolder) reports a typecheck+build step per combo; fails if any kit references a tier file that does not exist on disk.
- [ ] **Run** → red.
- [ ] **Implement** — `scripts/check-kits.mjs` (model on `scripts/check-templates.mjs`): for each kit, validate `kit.json` against `KitManifestSchema`, assert every file in `tiers.*` exists, then for each compatible base scaffold the base + `applyKit` into a temp dir and run `tsc --noEmit` + the base's build. Add `"kits:check": "node scripts/check-kits.mjs"` to root `package.json`.
- [ ] **Run** → green. **Commit**: `test(kits): kit×base matrix check harness`.

### Task 11 — boundary check, CI, changeset, decisions

- [ ] **Implement** — `.dependency-cruiser.cjs`: rule `no-kits-engine-to-0gkit` (forbid `packages/0gkit-kits/src` → `@foundryprotocol/*`); rule `no-kit-overlay-to-foundry-app` (forbid `templates/_kits` → `@foundryprotocol/(?!0gkit-)`). Run `pnpm boundary:check` → green.
- [ ] **Implement** — `.github/workflows/fresh-machine-smoke.yml`: add a `kits-check` job running `pnpm kits:check` on Node 20/22/24.
- [ ] **Implement** — `.changeset/kits-engine.md`: `@foundryprotocol/0gkit-kits` (new, minor 0.1.0 → publish as 1.x with the fixed-version bump), `create-0g-app` minor, `create-0gkit-app` minor, `0gkit-cli` minor.
- [ ] **Implement** — `docs/DECISIONS.md` D77–D80:
  - **D77** — Kits are git overlays under `templates/_kits/`, applied via giget (reuse `fetchCi` pattern), not published packages or string codegen.
  - **D78** — `0gkit-kits` engine imports only `giget`+`zod`; never another `0gkit-*` (neutrality + CLI cold-start). Kit _overlays_ may import `0gkit-*`.
  - **D79** — 3-tier model: `lib` always, `adapters[base]` if present, `ui` on React bases only; a kit is offered for a base iff `resolveTiers` is non-empty.
  - **D80** — Kit composition: `composes[]` auto-applies dependency kits first; dedup by name; `conflicts[]` throws `KitError`.
- [ ] **Run** — full gate: `pnpm lint typecheck build test boundary:check templates:check kits:check format:check` → all green.
- [ ] **Commit**: `chore(kits): boundary rule + CI + changeset + D77–D80`. Open PR `K0 — Kits engine + agent-memory`. Squash-merge on green CI.

## Self-review checklist

- [ ] Engine has zero `0gkit-*`/`@foundryprotocol/*` imports (boundary:check green).
- [ ] `applyKit` is idempotent (re-apply writes no duplicate env lines, no dep churn).
- [ ] `agent-memory` applies + typechecks on react-app, chat, storage-app, mcp-agent.
- [ ] `--kits` and `0g add` share the same engine entry point (no duplicated apply logic).
- [ ] CLI cold-start unaffected (engine dynamic-imported; `0g --help` benchmark unchanged).
- [ ] `kits:check` fails loudly on a missing tier file or an invalid manifest.
- [ ] Changeset covers every package whose published surface changed.
- [ ] D77–D80 recorded; spec's K0 open-decision (reference kit = agent-memory) honored.
