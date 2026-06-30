---
"@foundryprotocol/0gkit-kits": patch
---

K3: add `inft-studio` and `yield-intel` kits to the registry.

- `inft-studio` — mint intelligent NFTs with AI-generated media on 0G Storage
  and attested provenance. Typed INFT contract via `Inft.sol` (standard ERC-721
  has no mint); provenance badge is a real EIP-191 signed receipt
  (✓ signature verified — not TEE-quote).
- `yield-intel` — read-only AI yield analysis with an attested decision log.
  Testnet-default (OG_NETWORK=galileo). Zero execution surface: the public API
  has no execute/trade/swap/send/transfer; a load-bearing negative test enforces
  this invariant for the lifetime of the kit. `DemoBanner` is non-removable.
