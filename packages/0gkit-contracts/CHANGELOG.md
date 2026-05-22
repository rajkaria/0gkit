# @foundryprotocol/0gkit-contracts

## 0.3.0

### Minor Changes

- b9e8c23: SP4 — typed contract clients + Foundry codegen.
  - New package `@foundryprotocol/0gkit-contracts` with five standard 0G contracts
    pre-bundled (ERC-20, ERC-721, Multicall3, provider registry, attestation
    verifier) and a wagmi-style `createTypedContract` factory. `.read.method()` /
    `.write.method()` returns a `Receipt` shape, `.events.Event()` pulls logs via
    `viem.getLogs`.
  - `0g contracts generate --abi <foundry-artifact>.json --out <dir>` consumes
    `forge build` output and emits typed `.ts` clients. Output is deterministic
    and passes `tsc --strict --noEmit` with zero `any`.
  - `0g contracts list` and `0g contracts info <name>` for discovery.
  - Honest defaults: contracts that 0G hasn't pinned an address for yet (registry,
    attestation verifier) throw a CONFIG error with a clear hint instead of
    shipping a fabricated address.

- c834d6a: SP7: cost estimator + dry-run. Every primitive answers "what will this cost?" before broadcasting.
  - `0gkit-core`: new `Estimate` / `DryRunResult<T>` envelope + `formatEstimate(est)` + `formatNative(wei)`.
  - `0gkit-storage`: `Storage.estimate(bytes)` + `Storage.upload(bytes, { dryRun: true })`.
  - `0gkit-compute`: `Compute.estimate({ messages, model?, maxOutputTokens? })` + `Compute.inference(args, { dryRun: true })`. Char/4 token heuristic (D21).
  - `0gkit-da`: `DA.estimate(payload)` + `DA.publish(payload, { dryRun: true })`. Default rate `1e6 wei/byte` (D23).
  - `0gkit-contracts`: new `typedContract.estimate.<method>(...args)` namespace using `estimateContractGas` + `getGasPrice`; `write.<method>(args, { dryRun: true })` runs `simulateContract` without broadcasting.
  - `0gkit-cli`: new `0g estimate storage | compute | da | contracts` subcommands + `--dry-run` flag on `0g storage put`, `0g da publish`, `0g infer`.

### Patch Changes

- c4fc6fe: SP5 — `@foundryprotocol/0gkit-testing` ships.
  - New package `@foundryprotocol/0gkit-testing` with `testWallet({ index })`
    (HD-derived from anvil's dev mnemonic — matches devnet account 0 directly),
    `mockStorageClient` / `mockComputeClient` / `mockDAClient` with in-memory
    state for upload→download / chat / publish→verify round-trips,
    `fixtureReceipt` and `fixtureAttestation` for unit-test payloads.
  - `setupLocalDevnet({ autoStart })` — vitest `globalSetup`-friendly wrapper
    over SP2's `0g dev`, lazily importing `0gkit-devnet` so the testing package
    stays light when devnet isn't used.
  - Vitest matchers under the `/matchers` sub-path: `toBeConfirmedOn0G`,
    `toHaveRootMatching`, `toBeValidAttestation`, `toBeZeroGError`. Import once
    via `import "@foundryprotocol/0gkit-testing/matchers"` in your vitest setup.
  - One existing test suite in every `0gkit-*` package migrated to use the
    new mocks/fixtures — proving the API is real, not just demoed.

- Updated dependencies [c834d6a]
  - @foundryprotocol/0gkit-core@0.3.0
