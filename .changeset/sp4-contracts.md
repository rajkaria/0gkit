---
"@foundryprotocol/0gkit-contracts": minor
"@foundryprotocol/0gkit-cli": minor
---

SP4 — typed contract clients + Foundry codegen.

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
