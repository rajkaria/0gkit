---
title: K8 — `0g contracts import <address|abi>`
date: 2026-06-30
epic: kits
sprint: K8 (old SP20)
spec: ../specs/2026-06-30-0gkit-kits-design.md
roadmap: 2026-06-30-kits-epic-roadmap.md
status: ready
depends_on: [K0]
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

# K8 — `0g contracts import`

## Goal

Close the last gap in the contracts story (SP4 shipped `generate/list/info`). After K8:

```bash
0g contracts import 0xAbC… --name MyToken
#   → fetch the verified ABI from chainscan.0g.ai → SP4 codegen
#   → typed client at ./0gkit/contracts/MyToken.ts
0g contracts import --abi ./build/MyToken.json --name MyToken
#   → same codegen path for an off-chain ABI
```

**K0 synergy:** the `inft-studio` kit docs reference `0g contracts import` as the
way to pull a deployed iNFT contract into a typed client.

## Dependencies / Architecture

- **The codegen already exists** — `0g contracts generate` wraps
  `deps.contracts.generate({ abiPath, outDir, name })`
  ([packages/0gkit-cli/src/commands/contracts.ts](../../../packages/0gkit-cli/src/commands/contracts.ts)),
  which calls `0gkit-contracts`'s `generate()`
  ([packages/0gkit-contracts/src/codegen/index.ts](../../../packages/0gkit-contracts/src/codegen/index.ts)).
  K8 adds an **ABI source step** in front of that same codegen — it does **not**
  re-implement codegen.
- **New `fetchExplorerAbi(address, network)`** in `0gkit-contracts`: hits the
  chain explorer's verified-ABI endpoint for the active network. Explorer bases
  are already in the core network presets
  (`galileo.explorer = "https://chainscan-galileo.0g.ai"`,
  `aristotle.explorer = "https://chainscan.0g.ai"`,
  [packages/0gkit-core/src/networks.ts](../../../packages/0gkit-core/src/networks.ts)).
  The `fetch` is injected so it is testable without network and no behaviour is
  gated on Aristotle being live (D10) — galileo is the default and works.
- **`0g contracts import`** is a new subcommand on the existing `contracts`
  command group. It accepts **either** `<address>` (fetch → codegen) **or**
  `--abi <path>.json` (codegen directly, matching `generate`). It writes to
  `./0gkit/contracts/<name>.ts` by default. Dependency-injected through
  `ProgramDeps.contracts` so it is unit-testable.
- **Honesty rule:** if the explorer returns "ABI not verified", surface a clear
  `ConfigError` telling the user to pass `--abi` with the artifact JSON — never
  fabricate an ABI.

## Tech Stack

TypeScript (ESM, `"import"`-only per D68), tsup, vitest, commander. pnpm + turbo.
Changesets.

## Working dir / Branch

- Working dir: `/Users/rajkaria/Projects/0G-ai-kit`
- Branch: `kits-k8-contracts-import` off `main`

## File structure

**Created**

```
packages/0gkit-contracts/src/explorer.ts             # fetchExplorerAbi(address, network, { fetch })
packages/0gkit-contracts/src/__tests__/explorer.test.ts
packages/0gkit-cli/src/__tests__/contracts-import.test.ts
```

**Modified**

```
packages/0gkit-contracts/src/index.ts                # export fetchExplorerAbi
packages/0gkit-cli/src/commands/contracts.ts         # `import <address>` + `--abi` subcommand
packages/0gkit-cli/src/program.ts                    # deps.contracts.fetchExplorerAbi + importContract
packages/0gkit-cli/src/__tests__/program.test.ts     # `contracts import` registered
apps/docs/app/packages/0gkit-contracts/page.mdx      # import flow
.changeset/k8-contracts-import.md                     # contracts minor + cli minor
docs/DECISIONS.md                                     # D89–D90
```

## Task graph

```
T1 fetchExplorerAbi() (chainscan) ──┐
                                     ▼
                        T2 0g contracts import wiring
                        (address → fetch → codegen | --abi)
                                     │
                                     ▼
                        T3 docs import flow (+ inft-studio ref)
                                     ▼
                        T4 changeset + D89–D90 + gate
```

---

## Tasks

### T1 — `fetchExplorerAbi(address, network)`

- [ ] **Failing test** — `packages/0gkit-contracts/src/__tests__/explorer.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { fetchExplorerAbi } from "../explorer.js";

describe("fetchExplorerAbi", () => {
  it("hits the galileo chainscan ABI endpoint and parses the ABI", async () => {
    const abi = [{ type: "function", name: "balanceOf", inputs: [], outputs: [] }];
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: "1", result: JSON.stringify(abi) }),
    }));
    const out = await fetchExplorerAbi("0xAbC", "galileo", {
      fetch: fetchImpl as never,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("chainscan-galileo.0g.ai"),
      expect.anything()
    );
    expect(out).toEqual(abi);
  });

  it("throws a typed error when the contract is not verified", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: "0", result: "Contract source code not verified" }),
    }));
    await expect(
      fetchExplorerAbi("0xAbC", "galileo", { fetch: fetchImpl as never })
    ).rejects.toThrow(/not verified/i);
  });
});
```

- [ ] **Run** — `pnpm --filter @foundryprotocol/0gkit-contracts test` → red.
- [ ] **Implement** — `packages/0gkit-contracts/src/explorer.ts`:

```ts
import { ConfigError, getNetwork, type NetworkName } from "@foundryprotocol/0gkit-core";

export interface FetchAbiOptions {
  fetch?: typeof fetch;
}

export async function fetchExplorerAbi(
  address: string,
  network: NetworkName,
  opts: FetchAbiOptions = {}
): Promise<unknown[]> {
  const preset = getNetwork(network);
  if (!preset.explorer)
    throw new ConfigError(
      `No block explorer is configured for network '${network}'.`,
      `Use --network galileo|aristotle, or pass --abi <path>.json instead.`
    );
  const f = opts.fetch ?? globalThis.fetch;
  const url = `${preset.explorer}/api?module=contract&action=getabi&address=${address}`;
  const res = await f(url, { method: "GET" });
  if (!res.ok)
    throw new ConfigError(
      `Explorer ABI lookup failed (HTTP ${res.status}) for ${address}.`,
      `Verify the address + network, or pass --abi <path>.json.`
    );
  const body = (await res.json()) as { status?: string; result?: string };
  if (body.status !== "1" || !body.result || body.result.startsWith("Contract"))
    throw new ConfigError(
      `Contract ${address} is not verified on the ${network} explorer.`,
      `Pass the build artifact: 0g contracts import --abi <path>.json --name <Name>.`
    );
  try {
    return JSON.parse(body.result) as unknown[];
  } catch {
    throw new ConfigError(
      `Explorer returned a malformed ABI for ${address}.`,
      `Pass --abi <path>.json with the verified artifact instead.`
    );
  }
}
```

Export `fetchExplorerAbi` from `src/index.ts`. (`0gkit-contracts` already depends on `0gkit-core` — neutrality intact.)

- [ ] **Run** → green. **Commit**: `feat(contracts): fetchExplorerAbi(address, network) — chainscan verified-ABI fetch`.

### T2 — `0g contracts import` wiring (address → fetch → codegen | `--abi`)

- [ ] **Failing test** — `packages/0gkit-cli/src/__tests__/contracts-import.test.ts`: `0g contracts import 0xAbC --name MyToken` calls the injected `fetchExplorerAbi("0xAbC","galileo")`, writes the fetched ABI to a temp file, then calls `contracts.generate({ abiPath, outDir: "./0gkit/contracts", name: "MyToken" })`; `0g contracts import --abi ./x.json --name MyToken` skips the fetch and calls `generate` directly; passing neither address nor `--abi` errors early.
- [ ] **Run** → red.
- [ ] **Implement** — add to `registerContracts` in `contracts.ts`:

```ts
contracts
  .command("import [address]")
  .description(
    "Fetch a verified ABI from the chain explorer and codegen a typed client"
  )
  .option("--abi <path>", "use an off-chain artifact JSON instead of fetching")
  .option("--name <name>", "contract name (and output filename)")
  .option("--out <dir>", "output directory", "./0gkit/contracts")
  .action(async function (this: Command, address: string | undefined) {
    const opts = this.opts() as { abi?: string; name?: string; out: string };
    await runCommand(deps, this, async (ctx) => {
      let abiPath = opts.abi;
      if (!abiPath) {
        if (!address)
          throw new ConfigError(
            `Pass a contract <address> or --abi <path>.json.`,
            `e.g. 0g contracts import 0xAbc… --name MyToken`
          );
        const abi = await deps.contracts.fetchExplorerAbi(address, ctx.network);
        abiPath = await deps.contracts.writeTempAbi(abi);
      }
      const result = await deps.contracts.generate({
        abiPath,
        outDir: opts.out,
        name: opts.name,
      });
      return {
        human: [
          `✓ imported ${result.name} → ${result.outputPath}`,
          address
            ? `  source: ${ctx.network} explorer (${address})`
            : `  source: ${opts.abi}`,
          `  ${result.bytesWritten} bytes`,
        ],
        json: { ...result, address: address ?? null, network: ctx.network },
      };
    });
  });
```

Add `fetchExplorerAbi` + a `writeTempAbi(abi)` helper to `ProgramDeps.contracts`; default `fetchExplorerAbi` calls the `0gkit-contracts` export; `writeTempAbi` writes JSON to a temp path via `deps.fs`. `ConfigError` already imported in `contracts.ts`.

- [ ] **Run** → green. **Commit**: `feat(cli): 0g contracts import <address|--abi> → typed client`.

### T3 — docs import flow (+ `inft-studio` reference, K0 synergy)

- [ ] **Implement** — extend `apps/docs/app/packages/0gkit-contracts/page.mdx` with an "Import a deployed contract" section: the `import <address>` flow, the `--abi` path, the not-verified fallback, and the `./0gkit/contracts/<name>.ts` output. Add the K0 synergy line: "Kits like `inft-studio` reference `0g contracts import` to pull a deployed iNFT contract into a typed client." (The `inft-studio` kit page itself is authored in K3; this is the contracts-side pointer.)
- [ ] **Run** — `pnpm docs:check` → green.
- [ ] **Commit**: `docs(contracts): import flow + inft-studio reference`.

### T4 — changeset + decisions + gate

- [ ] **Implement** — `.changeset/k8-contracts-import.md`: `@foundryprotocol/0gkit-contracts` minor (`fetchExplorerAbi`) + `0gkit-cli` minor (`contracts import`).
- [ ] **Implement** — `docs/DECISIONS.md` D89–D90:
  - **D89** — `0g contracts import` reuses the SP4 codegen (`generate()`); the only new surface is `fetchExplorerAbi(address, network)`. Address path and `--abi` path converge on the same codegen — no duplicated emitter.
  - **D90** — Explorer ABI fetch is `fetch`-injected and honest: a not-verified contract yields a typed `ConfigError` pointing at `--abi`, never a fabricated ABI. Galileo is the default; no Aristotle gating (D10).
- [ ] **Run** — full gate: `pnpm lint typecheck build test boundary:check templates:check format:check` → all green.
- [ ] **Commit**: `chore(k8): changeset + D89–D90`. Open PR `K8 — contracts import`. Squash-merge on green CI.

## Self-review checklist

- [ ] `import <address>` and `import --abi` converge on the existing `generate()` codegen (no duplicate emitter).
- [ ] `fetchExplorerAbi` uses the core preset explorer base; `fetch` is injectable (offline tests).
- [ ] Not-verified / malformed-ABI / no-explorer paths all throw typed `ConfigError`s pointing at `--abi`.
- [ ] Output lands at `./0gkit/contracts/<name>.ts`; `--out` overrides.
- [ ] Galileo default works; no behaviour gated on Aristotle (D10).
- [ ] Docs cover the import flow + the `inft-studio` reference.
- [ ] Changeset covers `0gkit-contracts` + `0gkit-cli`; D89–D90 recorded; boundary:check green.
