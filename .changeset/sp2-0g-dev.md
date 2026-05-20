---
"@foundryprotocol/0gkit-devnet": minor
"@foundryprotocol/0gkit-cli": minor
---

SP2: `0g dev` — a local 0G stack (anvil + storage / compute / DA mocks) that
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
