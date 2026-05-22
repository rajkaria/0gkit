# @foundryprotocol/0gkit-testing

## 0.3.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [c834d6a]
  - @foundryprotocol/0gkit-core@0.3.0
