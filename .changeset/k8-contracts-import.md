---
"@foundryprotocol/0gkit-contracts": minor
"@foundryprotocol/0gkit-cli": minor
---

Add `0g contracts import <address|--abi>` — pull a **verified** ABI from the 0G
ChainScan explorer and codegen a typed client, closing the last gap in the
contracts story (`generate`/`list`/`info` shipped in SP4). New
`0gkit-contracts` export `fetchExplorerAbi(address, network)` hits the explorer's
Etherscan-compatible `/open/api?module=contract&action=getabi` endpoint (verified
live on galileo + mainnet; keyless, optional `OG_EXPLORER_API_KEY`). The address
path and the `--abi <path>.json` path converge on the existing `generate()`
codegen — no duplicate emitter. An unverified contract yields a typed
`ConfigError` pointing at `--abi`, never a fabricated ABI (D93). `fetch` is
injected so it is testable offline and nothing is gated on mainnet being live
(D10).
