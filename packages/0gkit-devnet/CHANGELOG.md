# @foundryprotocol/0gkit-devnet

## 0.3.0

### Patch Changes

- Updated dependencies [c834d6a]
  - @foundryprotocol/0gkit-core@0.3.0

## 0.2.0

### Minor Changes

- 662eb80: SP2: `0g dev` — a local 0G stack (anvil + storage / compute / DA mocks) that
  starts in under five seconds with 10 prefunded dev accounts. Eliminates the
  Galileo faucet round-trip during development.

  New package `@foundryprotocol/0gkit-devnet` owns the four service mocks (Node
  HTTP, filesystem CAS for storage, OpenAI-compatible compute with Ollama
  auto-detection, in-memory canonical-digest DA) and a deterministic HD-account
  derivation that matches anvil's well-known dev mnemonic.

  New CLI subcommand `0g dev start | stop | status | reset` orchestrates the
  lifecycle. State file lives at `~/.0g-dev/devnet.json`. The standard anvil
  dev mnemonic produces the same accounts you already trust from local
  Hardhat/Foundry workflows.

### Patch Changes

- Updated dependencies [63a297e]
  - @foundryprotocol/0gkit-core@0.2.0
