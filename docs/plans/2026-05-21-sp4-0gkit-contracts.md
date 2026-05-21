# SP4 — `@foundryprotocol/0gkit-contracts` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kill hand-written ABIs. Ship `@foundryprotocol/0gkit-contracts` — a wagmi-style typed-contract layer with five standard 0G contracts pre-bundled (`registry`, `attestationVerifier`, `erc20`, `erc721`, `multicall3`) plus a `0g contracts generate` CLI subcommand that consumes Foundry artifacts and emits fully typed TS clients. After SP4, calling a contract on 0G is `myContract.read.balanceOf(addr)` with full IntelliSense, not `["function balanceOf(address) view returns (uint256)"]` in a string array.

**Architecture:**

- **Layer 2 `0gkit-contracts`** is a new Node/universal package. It depends only on `0gkit-core` (for `Signer`/`Receipt` types and `ZeroGError`) plus `viem` (runtime + peer). No React, no wallet, no transitive heaviness.
- **Public surface (built-in standard contracts):** A `standardContracts` object exposes typed factories for each of the 5 contracts. Each factory accepts `{ network, signer?, address? }` — `network` picks the bundled address if known; `address` overrides for custom deployments; `signer` enables `.write.*` and `.events.*` against a wallet client.
- **Typed factory `createTypedContract`:** thin adapter over `viem.getContract` that (a) builds the `PublicClient`/`WalletClient` from `network` + `signer`, (b) wraps `write.*` calls so they auto-wait for a receipt and return a `Receipt` shape (matching `0gkit-core.Receipt`), (c) exposes `events.<Name>({ fromBlock?, toBlock? })` returning typed logs via `viem.getLogs`.
- **Codegen `0gkit-contracts/codegen`:** pure TypeScript template strings, no `ts-morph` / `@swc`. Reads a Foundry artifact (`{ abi, contractName }` JSON output by `forge build`), emits one `.ts` file per contract with the same `attach()` shape as the bundled standards. Output passes `tsc --strict --noEmit` with zero `any`.
- **CLI surface in `0gkit-cli`:** new `contracts` subcommand group with `generate`, `list`, `info`. Wired via the existing `ProgramDeps` DI seam so tests stay hermetic.

**Tech Stack:** Node 20+ ESM, TypeScript 5.6, `viem ^2.21` (runtime + peer), `vitest`, `tsup`. No new heavy deps. Prettier-first.

**Decisions referenced:** D3 (neutrality CI gate), D9 (flat SCREAMING_SNAKE error codes), D11 (`Signer` in core). New: **D14 — wagmi-style `.read.method()` API**, **D15 — Foundry artifact as primary codegen input**, **D16 — codegen via TS template strings, not ts-morph**.

**Depends on:** SP3 (`Signer` adopted across primitives — already shipped). Pure additive otherwise.

**Hard invariants:**

- `0gkit-contracts` is under `packages/0gkit-*/` so the boundary rule (no `@foundryprotocol/*` non-0gkit deps) auto-applies. Protocol-neutral.
- The five standard contracts ship with **real ABIs** (ERC-20, ERC-721, Multicall3 are universal) but use **`null` addresses by default** for `registry` and `attestationVerifier` — those addresses are not yet published by 0G. The package surfaces a clear `ZeroGError('CONFIG', 'Standard contract address not yet pinned for network=X — pass { address } explicitly.')` when used without an override, per the honesty rule.
- Generated code is **deterministic**: same artifact in → byte-identical TS out. Snapshot-tested.
- Generated code passes `tsc --strict --noEmit` with **zero `any`**.
- Coverage **80% lines / 70% branches** on `0gkit-contracts` (same gate as the other primitives — codegen is mechanical so coverage comes free).

---

## File Structure

**Create — `0gkit-contracts`:**

- `packages/0gkit-contracts/package.json`
- `packages/0gkit-contracts/tsconfig.json`
- `packages/0gkit-contracts/tsup.config.ts`
- `packages/0gkit-contracts/vitest.config.ts`
- `packages/0gkit-contracts/README.md`
- `packages/0gkit-contracts/src/index.ts` — re-exports
- `packages/0gkit-contracts/src/types.ts` — `TypedContractOptions`, `TypedContract`, `ContractEventOptions`
- `packages/0gkit-contracts/src/clients.ts` — `buildClients(network, signer?)` → `{ publicClient, walletClient? }`
- `packages/0gkit-contracts/src/factory.ts` — `createTypedContract(opts)`
- `packages/0gkit-contracts/src/standard/index.ts` — `standardContracts` object
- `packages/0gkit-contracts/src/standard/erc20.ts` — ABI + factory
- `packages/0gkit-contracts/src/standard/erc721.ts`
- `packages/0gkit-contracts/src/standard/multicall3.ts`
- `packages/0gkit-contracts/src/standard/registry.ts` — 0G provider registry (placeholder addresses, real ABI shape)
- `packages/0gkit-contracts/src/standard/attestation-verifier.ts` — TEE attestation verifier (placeholder addresses)
- `packages/0gkit-contracts/src/standard/addresses.ts` — `KNOWN_ADDRESSES` map per network
- `packages/0gkit-contracts/src/codegen/index.ts` — `generate(opts)` orchestrator
- `packages/0gkit-contracts/src/codegen/parser.ts` — parse Foundry artifact JSON
- `packages/0gkit-contracts/src/codegen/emit.ts` — emit TS source for one contract
- `packages/0gkit-contracts/src/codegen/format.ts` — minimal TS pretty-print helper
- `packages/0gkit-contracts/src/__tests__/factory.test.ts`
- `packages/0gkit-contracts/src/__tests__/standard.test.ts`
- `packages/0gkit-contracts/src/__tests__/codegen.parser.test.ts`
- `packages/0gkit-contracts/src/__tests__/codegen.emit.test.ts`
- `packages/0gkit-contracts/src/__tests__/codegen.integration.test.ts`
- `packages/0gkit-contracts/src/__tests__/boundary.test.ts`
- `packages/0gkit-contracts/src/__tests__/fixtures/foundry-artifact.json` — real ERC20 artifact for integration test
- `packages/0gkit-contracts/CHANGELOG.md`
- `packages/0gkit-contracts/LICENSE`

**Modify — `0gkit-cli`:**

- `packages/0gkit-cli/package.json` — add `@foundryprotocol/0gkit-contracts` dependency
- `packages/0gkit-cli/tsup.config.ts` — add `@foundryprotocol/0gkit-contracts` to `external`
- `packages/0gkit-cli/src/program.ts` — extend `ProgramDeps` with `contracts: { generate, listStandard, getStandard }`; call `registerContracts(program, deps)` in `buildProgram`
- `packages/0gkit-cli/src/cli.ts` — wire real `contracts` deps in `ProgramDeps`
- `packages/0gkit-cli/src/commands/contracts.ts` — new file: `registerContracts(program, deps)`
- `packages/0gkit-cli/src/__tests__/commands/contracts.test.ts` — new test file
- `packages/0gkit-cli/src/__tests__/boundary.test.ts` — boundary assertion stays green (contracts is a `0gkit-*` package, allowed)

**Modify — workspace:**

- `pnpm-workspace.yaml` — no change (packages/\* glob already covers new package)
- `.github/workflows/ci.yml` — no new job needed (existing `pnpm build/typecheck/test/boundary:check` cover the new package automatically)
- `.changeset/sp4-contracts.md` — new minor changeset for `0gkit-contracts` (first publish) + `0gkit-cli` (new command)
- `docs/DECISIONS.md` — append D14, D15, D16
- `docs/specs/2026-05-20-essentials-roadmap.md` — mark SP4 status complete with PR link (after merge)
- `README.md` — add `@foundryprotocol/0gkit-contracts` to the package matrix

---

## Tasks

### Task 1: Scaffold `0gkit-contracts` package skeleton

- [ ] Create `packages/0gkit-contracts/package.json` mirroring `0gkit-chain/package.json`:
  - `name`: `@foundryprotocol/0gkit-contracts`
  - `version`: `0.0.0` (changeset will bump)
  - `description`: `"Typed contract clients for 0G. Five standard 0G contracts pre-bundled (registry, attestation verifier, ERC-20, ERC-721, multicall3) plus a 'forge build' → typed TS codegen. Wagmi-style .read.method() / .write.method() / .events.Event(), no hand-written ABIs."`
  - `homepage` / `repository` / `bugs`: `rajkaria/0gkit` tree path
  - `dependencies`: `@foundryprotocol/0gkit-core: workspace:*`, `viem: ^2.21.0`
  - `peerDependencies`: `viem: ^2.21.0`
  - `devDependencies`: same as `0gkit-chain` (`@types/node`, `dependency-cruiser`, `rimraf`, `tsup`, `typescript`, `vitest`)
  - `keywords`: `["0g", "0g-network", "viem", "contracts", "codegen", "abi", "toolkit"]`
  - `publishConfig.access`: `"public"`
- [ ] Copy `tsconfig.json` from `0gkit-chain`.
- [ ] Create `tsup.config.ts` with two entry points: `index` (main) and `codegen` (sub-path so consumers can import codegen without pulling the full standard-contracts ABI bundle). Externalize `viem`, `@foundryprotocol/0gkit-core`.
- [ ] Create `vitest.config.ts` mirroring `0gkit-chain` thresholds (80/80/80/70).
- [ ] Create `README.md` with quickstart + standard-contracts list + codegen example.
- [ ] Create `LICENSE` (MIT, same as siblings).
- [ ] Create `CHANGELOG.md` (empty header).

**Acceptance:** `pnpm install` succeeds; `pnpm --filter @foundryprotocol/0gkit-contracts build` produces empty `dist/` without errors (no src yet — placeholder index.ts).

### Task 2: Implement `createTypedContract` + client builders

- [ ] `src/types.ts` — define:

  ```ts
  import type {
    Abi,
    Address,
    PublicClient,
    WalletClient,
    GetLogsParameters,
    Log,
  } from "viem";
  import type { Signer, Receipt } from "@foundryprotocol/0gkit-core";

  export type Network = "aristotle" | "galileo" | "local";

  export interface TypedContractOptions<TAbi extends Abi> {
    abi: TAbi;
    address: Address;
    /** Override RPC URL. Defaults from network preset. */
    rpcUrl?: string;
    /** When provided, enables write + event-subscribe paths. */
    signer?: Signer;
    /** Pre-built viem clients. When omitted, factory builds them. */
    publicClient?: PublicClient;
    walletClient?: WalletClient;
    network?: Network;
  }
  ```

- [ ] `src/clients.ts` — implement `buildClients(opts)` that:
  - Resolves `network` (default `galileo`) and `rpcUrl` (from `getNetwork(network).rpcUrl` if not provided).
  - Builds `publicClient` via `viem.createPublicClient({ chain, transport: http(rpcUrl) })`.
  - If `signer` is provided AND signer exposes `privateKey`, builds `walletClient` via `viem.createWalletClient({ chain, transport: http(rpcUrl), account: privateKeyToAccount(privateKey) })`.
  - If `signer` is provided WITHOUT `privateKey` (KMS/wagmi), builds `walletClient` via `createWalletClient({ chain, transport: http(rpcUrl), account: { ...address, signMessage, signTransaction, signTypedData, type: 'local' } })` wrapping the signer's methods.
  - Returns `{ publicClient, walletClient? }`.
- [ ] `src/factory.ts` — implement `createTypedContract<TAbi>(opts)`:
  - If `publicClient` not provided, call `buildClients(opts)`.
  - Use `viem.getContract({ abi, address, client: { public: publicClient, wallet: walletClient } })` — this gives us viem's typed `read.<method>` and `write.<method>` for free.
  - Wrap returned `write.<method>` so it: (a) calls the original write (returns `0x${string}` hash), (b) immediately calls `publicClient.waitForTransactionReceipt({ hash })`, (c) returns a `Receipt` shape — `{ txHash, blockNumber, latencyMs }`.
  - Provide `events.<EventName>({ fromBlock?, toBlock?, args? })` by enumerating events from the ABI and constructing `publicClient.getLogs({ address, event, fromBlock, toBlock, args })` calls.
  - Return `{ read, write, events, address, abi }` typed-narrowly.
- [ ] Errors: any viem error during `read`/`write` is rewrapped as `ZeroGError('CHAIN', friendlyMessage, hintToUserAboutGas/Nonce)` — match the existing pattern in `0gkit-chain`.

**Acceptance:** Tests in Task 8 pass against a viem-mocked `PublicClient`/`WalletClient`.

### Task 3: Build the five standard contracts

- [ ] `src/standard/addresses.ts`:

  ```ts
  // Real, universally-deployed addresses where they exist; null where unknown.
  // Per the honesty rule: never fabricate. CONFIG error surfaces clearly.
  export const KNOWN_ADDRESSES = {
    multicall3: {
      // Universal Multicall3 deployment — same across all EVM chains.
      aristotle: "0xcA11bde05977b3631167028862bE2a173976CA11" as const,
      galileo: "0xcA11bde05977b3631167028862bE2a173976CA11" as const,
      local: "0xcA11bde05977b3631167028862bE2a173976CA11" as const,
    },
    registry: { aristotle: null, galileo: null, local: null },
    attestationVerifier: { aristotle: null, galileo: null, local: null },
    // erc20 / erc721 are not network-singletons; callers pass { address }.
  };
  ```

- [ ] `src/standard/erc20.ts` — ABI: standard ERC-20 (`name`, `symbol`, `decimals`, `totalSupply`, `balanceOf`, `transfer`, `approve`, `transferFrom`, `allowance`, events `Transfer`, `Approval`). Export `Erc20Abi as const` and `erc20({ network, address, signer? })` factory that requires `address`.
- [ ] `src/standard/erc721.ts` — ABI: standard ERC-721 (`name`, `symbol`, `tokenURI`, `ownerOf`, `balanceOf`, `approve`, `getApproved`, `setApprovalForAll`, `isApprovedForAll`, `transferFrom`, `safeTransferFrom`, events `Transfer`, `Approval`, `ApprovalForAll`). Factory `erc721({ network, address, signer? })`.
- [ ] `src/standard/multicall3.ts` — ABI: Multicall3 standard (`aggregate`, `aggregate3`, `aggregate3Value`, `blockAndAggregate`, etc.). Factory `multicall3({ network, address?, signer? })` — defaults `address` from `KNOWN_ADDRESSES.multicall3[network]`.
- [ ] `src/standard/registry.ts` — Plausible ABI for a 0G provider registry: `getProvider(bytes32 id)` view returning `(address operator, string url, uint256 stake, bool active)`; `registerProvider(string url, uint256 stake)` write returning `bytes32 id`; events `ProviderRegistered`, `ProviderDeactivated`. Factory `registry({ network, address?, signer? })` — if `address` omitted AND `KNOWN_ADDRESSES.registry[network] === null`, throws `ZeroGError('CONFIG', \`0G registry contract address is not yet pinned for network=\${network}. Pass { address } explicitly when 0G publishes it.\`, '...')`.
- [ ] `src/standard/attestation-verifier.ts` — Plausible ABI mirroring `0gkit-attestation` shape: `verify(bytes envelope)` view returning `(bool ok, bytes32 signerHash)`; `submitAttestation(bytes envelope)` write; event `AttestationSubmitted`. Same fallback behavior as `registry`.
- [ ] `src/standard/index.ts`:

  ```ts
  import { erc20 } from "./erc20.js";
  import { erc721 } from "./erc721.js";
  import { multicall3 } from "./multicall3.js";
  import { registry } from "./registry.js";
  import { attestationVerifier } from "./attestation-verifier.js";
  export const standardContracts = {
    erc20,
    erc721,
    multicall3,
    registry,
    attestationVerifier,
  };
  export { Erc20Abi } from "./erc20.js";
  export { Erc721Abi } from "./erc721.js";
  export { Multicall3Abi } from "./multicall3.js";
  export { RegistryAbi } from "./registry.js";
  export { AttestationVerifierAbi } from "./attestation-verifier.js";
  ```

**Acceptance:** Tests in Task 8 confirm each factory returns the right shape; the `registry`/`attestationVerifier` paths surface the honest CONFIG error when address is missing.

### Task 4: Codegen — parser

- [ ] `src/codegen/parser.ts`:

  ```ts
  import type { Abi } from "viem";
  export interface FoundryArtifact {
    abi: Abi;
    contractName?: string;
    // forge-build also emits .bytecode, .deployedBytecode, .metadata, .ast — we only need abi + contractName
  }
  export interface ParsedContract {
    name: string; // Defaults to contractName, else inferred from file path
    abi: Abi;
  }
  export function parseFoundryArtifact(json: string, hintName?: string): ParsedContract;
  ```

- [ ] Implementation parses the JSON, validates `{ abi: Array }` exists, throws `ZeroGError('CONFIG', 'Not a Foundry artifact: missing .abi array', 'Run `forge build` and pass the JSON from out/<Contract>.sol/<Contract>.json.')` otherwise. `name` resolution order: explicit `hintName` arg → `contractName` field → throw.
- [ ] Reject ABIs containing duplicate function names (TS overloads aren't free — surface clearly): `ZeroGError('CONFIG', 'ABI contains overloaded methods (...) — overloads aren't supported in v0.', 'Rename one of the overloads or use createTypedContract directly.')`.

**Acceptance:** Tests in Task 8 cover valid artifact, missing-abi, overload-rejection, name-inference.

### Task 5: Codegen — emit

- [ ] `src/codegen/format.ts` — minimal helper `indent(str, level)`; no full pretty-printer needed (output goes through `prettier` if the user wants it).
- [ ] `src/codegen/emit.ts` — `emitContract(parsed: ParsedContract): string` returns one valid TS file:

  ```ts
  // GENERATED FILE — do not edit. Regenerate via `0g contracts generate`.
  import type { Address, PublicClient, WalletClient } from "viem";
  import type { Signer } from "@foundryprotocol/0gkit-core";
  import { createTypedContract } from "@foundryprotocol/0gkit-contracts";

  export const MyContractAbi = [
    /* abi inlined as `as const` literal */
  ] as const;

  export interface MyContractAttachOptions {
    address: Address;
    network?: "aristotle" | "galileo" | "local";
    rpcUrl?: string;
    signer?: Signer;
    publicClient?: PublicClient;
    walletClient?: WalletClient;
  }

  export function attachMyContract(opts: MyContractAttachOptions) {
    return createTypedContract({ abi: MyContractAbi, ...opts });
  }

  export const MyContract = { attach: attachMyContract, abi: MyContractAbi };
  ```

- [ ] The ABI literal is `JSON.stringify(abi, null, 2)` with `as const` appended. `viem.getContract` infers full method/event types from this literal.
- [ ] The emitter ensures the contract name is a valid TS identifier (alphanumeric + `_`, doesn't start with digit). If invalid, throws `ZeroGError('CONFIG', '\`${name}\` is not a valid TS identifier', 'Pass --name <ValidName> to override.')`.
- [ ] Idempotent: same input → byte-identical output. Snapshot tested.

**Acceptance:** Snapshot test passes; generated file passes `tsc --strict --noEmit` (covered by Task 8's integration test).

### Task 6: Codegen — orchestrator + watch

- [ ] `src/codegen/index.ts`:

  ```ts
  export interface GenerateOptions {
    abiPath: string; // path to Foundry artifact JSON
    outDir: string; // dir to write .ts files into
    name?: string; // optional override for contract name
    /** DI seam — defaults to node:fs/promises. */
    fs?: {
      readFile(p: string): Promise<string>;
      writeFile(p: string, c: string): Promise<void>;
      mkdir(p: string, opts?: { recursive?: boolean }): Promise<unknown>;
    };
  }
  export interface GenerateResult {
    name: string;
    outputPath: string;
    bytesWritten: number;
  }
  export async function generate(opts: GenerateOptions): Promise<GenerateResult>;
  ```

- [ ] Reads `abiPath`, calls `parseFoundryArtifact` then `emitContract`, ensures `outDir` exists, writes `<outDir>/<Name>.ts`, returns metadata.
- [ ] Watch mode is **deferred to a follow-up task chip** — base `generate()` is a one-shot. The CLI flag `--watch` will be parsed but call `generate()` in a loop using `fs.watch` only if Node 22+ APIs make it trivial; otherwise we leave the flag rejected with a "watch mode coming in SP4.1" error and capture a chip. (Don't block SP4 on this.)

**Acceptance:** Integration test in Task 8 writes a real generated file and `tsc --strict --noEmit` over it returns 0.

### Task 7: CLI integration — `0g contracts generate / list / info`

- [ ] `packages/0gkit-cli/src/commands/contracts.ts`:

  ```ts
  export function registerContracts(program: Command, deps: ProgramDeps): void {
    const contracts = program
      .command("contracts")
      .description("Generate typed contract clients + standard 0G contracts");

    contracts
      .command("generate")
      .description("Generate typed TS client from a Foundry artifact JSON")
      .requiredOption("--abi <path>", "path to forge build artifact JSON")
      .requiredOption("--out <dir>", "output directory for generated TS")
      .option("--name <name>", "override contract name")
      .action(async function (this: Command) {
        await runCommand(deps, this, async () => {
          const opts = this.opts() as { abi: string; out: string; name?: string };
          const result = await deps.contracts.generate({
            abiPath: opts.abi,
            outDir: opts.out,
            name: opts.name,
          });
          return {
            human: [
              `✓ generated ${result.name} → ${result.outputPath} (${result.bytesWritten} bytes)`,
            ],
            json: result,
          };
        });
      });

    contracts
      .command("list")
      .description("List bundled standard 0G contracts")
      .action(async function (this: Command) {
        await runCommand(deps, this, async (ctx) => {
          const list = deps.contracts.listStandard(ctx.network);
          return {
            human: list.map(
              (c) => `  ${c.name.padEnd(22)} ${c.address ?? "(address not yet pinned)"}`
            ),
            json: list,
          };
        });
      });

    contracts
      .command("info <name>")
      .description("Show details for a standard contract")
      .action(async function (this: Command, name: string) {
        await runCommand(deps, this, async (ctx) => {
          const info = deps.contracts.getStandard(name, ctx.network);
          return {
            human: [
              `${info.name}  network=${ctx.network}`,
              `  address  ${info.address ?? "(not yet pinned)"}`,
              `  methods  ${info.methods.length} (${info.methods.slice(0, 6).join(", ")}${info.methods.length > 6 ? ", …" : ""})`,
              `  events   ${info.events.join(", ") || "(none)"}`,
            ],
            json: info,
          };
        });
      });
  }
  ```

- [ ] Extend `ProgramDeps` in `program.ts` with:

  ```ts
  contracts: {
    generate: typeof generate;
    listStandard: (network: Network) => Array<{ name: string; address: string | null }>;
    getStandard: (name: string, network: Network) => { name: string; address: string | null; methods: string[]; events: string[] };
  }
  ```

- [ ] `cli.ts` wires real impls: imports from `@foundryprotocol/0gkit-contracts` and uses its standard-contracts metadata for the list/info helpers.
- [ ] Add `@foundryprotocol/0gkit-contracts` to `0gkit-cli/package.json` dependencies and to `tsup.config.ts` externals.
- [ ] Call `registerContracts(program, deps)` in `buildProgram`.

**Acceptance:** `0g contracts list` prints the 5 contracts with multicall3 address shown for galileo; `0g contracts info erc20` prints method list; `0g contracts generate --abi tests/fixtures/foundry-artifact.json --out /tmp/gen` writes `/tmp/gen/<Name>.ts` and exits 0. CLI tests cover all three subcommands with mocked deps.

### Task 8: Tests for `0gkit-contracts`

- [ ] `__tests__/factory.test.ts` — feeds a fake `publicClient`/`walletClient` to `createTypedContract` with a small ABI; asserts `read.<method>` calls into `publicClient.readContract` with right args; `write.<method>` calls into `walletClient.writeContract` THEN `publicClient.waitForTransactionReceipt`; result has `Receipt` shape.
- [ ] `__tests__/standard.test.ts` — verifies each of the 5 standard factories: shape of `read`/`write`/`events`, `multicall3` defaults address, `registry`/`attestationVerifier` throw the right `ZeroGError` when address omitted.
- [ ] `__tests__/codegen.parser.test.ts` — valid artifact, missing-abi error, name-inference, overload-rejection.
- [ ] `__tests__/codegen.emit.test.ts` — snapshot test on a small ABI (3 methods + 1 event); invalid-name rejection.
- [ ] `__tests__/codegen.integration.test.ts` — load `fixtures/foundry-artifact.json` (real ERC20 from a known compilation, committed to the repo), generate to a tmpdir, run `tsc --strict --noEmit` against the generated file using a programmatic API or `execa('npx', ['-y', 'tsc', '--strict', '--noEmit', '<file>'])`. Use a `skipIfOffline` guard so dependency download (the `-y` install) doesn't break offline CI; fall back to a pre-installed `tsc` from the repo's devDependencies.
- [ ] `__tests__/boundary.test.ts` — asserts `dependency-cruiser` reports no `@foundryprotocol/*` non-0gkit deps for this package (mirror the existing pattern from `0gkit-wallet/src/__tests__/boundary.test.ts`).
- [ ] `__tests__/fixtures/foundry-artifact.json` — committed: a minimal ERC20 artifact produced by `forge build` (we don't need to run forge; pre-stage the JSON).

**Acceptance:** `pnpm --filter @foundryprotocol/0gkit-contracts test` reports ≥80% lines / 70% branches, all green.

### Task 9: Tests for CLI `contracts` subcommand

- [ ] `0gkit-cli/src/__tests__/commands/contracts.test.ts`:
  - `0g contracts list` — both human + `--json` shapes
  - `0g contracts info erc20` — both human + `--json` shapes
  - `0g contracts info unknown` — throws CONFIG error
  - `0g contracts generate --abi ... --out ...` — calls injected `generate` mock with right args, prints success line
  - missing `--abi` — commander surfaces required-option error with non-zero exit

**Acceptance:** CLI tests green; overall `0gkit-cli` coverage stays ≥80/70.

### Task 10: Wire docs + changeset + roadmap

- [ ] `README.md` — add `@foundryprotocol/0gkit-contracts` row to the package matrix; add a "Typed contracts" section under the quickstart with the 3-line "attach + read.balanceOf" example.
- [ ] `packages/0gkit-contracts/README.md` — full package readme: quickstart, standard contracts list with their current address state per network, codegen guide (`0g contracts generate ...`), API reference for `createTypedContract` / `standardContracts` / `generate`.
- [ ] `docs/specs/2026-05-20-essentials-roadmap.md` — mark SP4 with status complete + PR link (after PR opens; updated again at merge time).
- [ ] `docs/DECISIONS.md` — append D14, D15, D16 entries with rationale.
- [ ] `.changeset/sp4-contracts.md` — minor bump entries:

  ```md
  ---
  "@foundryprotocol/0gkit-contracts": minor
  "@foundryprotocol/0gkit-cli": minor
  ---

  SP4 — typed contract clients + codegen.

  - New package `@foundryprotocol/0gkit-contracts` with five standard 0G
    contracts (ERC-20, ERC-721, Multicall3, provider registry, attestation
    verifier) and a wagmi-style `createTypedContract` factory.
  - `0g contracts generate --abi <path> --out <dir>` consumes Foundry
    artifacts and emits typed `.read.method() / .write.method() /
  .events.Event()` clients.
  - `0g contracts list` and `0g contracts info <name>` for discovery.
  ```

**Acceptance:** All listed files are present and committed. Roadmap PR-link backfill is a single-line edit after merge.

### Task 11: Full CI green + open PR + squash-merge

- [ ] From `0G-ai-kit` root: `pnpm install && pnpm --filter @foundryprotocol/0gkit-core build && pnpm build && pnpm format:check && pnpm lint && pnpm boundary:check && pnpm typecheck && pnpm test` — all green.
- [ ] Push branch, open PR titled `feat(contracts): SP4 — @foundryprotocol/0gkit-contracts (typed clients + codegen + repo rename)`. Body covers (a) repo rename, (b) standard contracts, (c) codegen, (d) CLI commands, (e) decisions D14–D16.
- [ ] Wait for CI green, then `gh pr merge --squash --auto --delete-branch`.
- [ ] After merge, on local `main`: `git pull`, edit roadmap spec to backfill SP4 PR URL.

**Acceptance:** PR squash-merged. Roadmap reflects SP4 = ✅.

---

## Decisions (to append to DECISIONS.md after Task 10)

### D14 — Typed contracts use wagmi-style `.read.method()` / `.write.method()` API

**Date:** 2026-05-21 · **SP:** SP4

`viem.getContract` already exposes typed `.read.balanceOf(args)` and `.write.transfer(args)` accessors when given an `Abi` literal. We surface this directly rather than wrapping it in a custom adapter (`.call('balanceOf', [arg])`). Reasons: (a) IntelliSense works out of the box; (b) the API is already industry-standard via wagmi; (c) zero adapter code to maintain. We layer one thin behavior on top — `write.*` auto-awaits the receipt and returns the `0gkit-core.Receipt` shape so users don't reach for two libraries to do one obvious thing.

### D15 — Codegen consumes Foundry artifacts (not Hardhat) as v0

**Date:** 2026-05-21 · **SP:** SP4

`forge build` is the recommended toolchain for 0G contracts (the `contracts/` directory in `foundry/Foundryprotocol` ships a `foundry.toml`, not a `hardhat.config.ts`). Foundry's artifact format is simple JSON with `{ abi, bytecode, contractName }` at the top level. Hardhat support adds variance (the file paths differ, the artifact format wraps abi inside an `output` object) — we'll add a Hardhat parser as a plugin in a follow-up, not v0. If users want Hardhat today, they can pass `--abi $(jq .abi artifacts/.../Foo.json > /tmp/abi.json && echo /tmp/abi.json)`.

### D16 — Codegen emits TS via template strings, not `ts-morph`

**Date:** 2026-05-21 · **SP:** SP4

`ts-morph` is ~6MB and ships its own TypeScript compiler. We need ~80 lines of `const out = \`import ...\` + JSON.stringify(abi)`— adding 6MB for that is a poor trade. Template strings are also byte-deterministic (snapshot-testable) and editable. If we ever need AST-level rewriting (rare), we'll add`ts-morph` then.

---

## Out of scope (deferred)

- **Hardhat artifact parser** — D15 explains. Follow-up: add `parseHardhatArtifact` to `src/codegen/parser.ts`.
- **`--watch` flag** — Task 6. Follow-up: implement with `node:fs/promises.watch()` and debounce.
- **Events `subscribe` (live pub/sub)** — SP6 (`0gkit-indexer`) handles real-time subscriptions with reorg safety. SP4's `events.<Name>(opts)` is pull-only via `getLogs`.
- **Bytecode + deploy helpers** — `contract.deploy(args)` would be nice but pushes us into private-key handling for transactions, which we want to keep in `0gkit-wallet`. Defer to SP6 or later.
