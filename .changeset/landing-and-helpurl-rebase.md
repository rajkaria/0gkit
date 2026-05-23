---
"@foundryprotocol/0gkit-attestation": patch
"@foundryprotocol/0gkit-chain": patch
"@foundryprotocol/0gkit-cli": patch
"@foundryprotocol/0gkit-compute": patch
"@foundryprotocol/0gkit-contracts": patch
"@foundryprotocol/0gkit-core": patch
"@foundryprotocol/0gkit-da": patch
"@foundryprotocol/0gkit-devnet": patch
"@foundryprotocol/0gkit-indexer": patch
"@foundryprotocol/0gkit-jobs": patch
"@foundryprotocol/0gkit-mcp": patch
"@foundryprotocol/0gkit-observability": patch
"@foundryprotocol/0gkit-react": patch
"@foundryprotocol/0gkit-storage": patch
"@foundryprotocol/0gkit-testing": patch
"@foundryprotocol/0gkit-wallet": patch
"@foundryprotocol/0gkit-wallet-react": patch
"create-0gkit-app": patch
---

Rebase `ERROR_HELP_BASE` from `https://0gkit.dev/errors/` to
`https://0gkit.com/errors/` (D38). `0gkit.com` is the canonical landing +
docs + playground deployment going forward; `0gkit.dev` is held as a
redirect-only alias so URLs already in v1.0.0 tarballs continue to
resolve forever.

Every package.json `homepage` now points to https://0gkit.com so that
npm package pages link back to the canonical site.

No API surface changes — `ZeroGError.helpUrl` is still derived from
`ERROR_HELP_BASE` via `helpUrlFor(code)`; only the constant moves.
