---
"@foundryprotocol/0gkit-kits": minor
---

feat(kits): add `trade-signal` kit — advisory AI buy/sell/hold signals with attested receipts.

The model scores an asset from its recent price history and returns an action + confidence + rationale; each signal can be signed by the operator key (EIP-191 signed receipt — ✓ signature verified, not TEE-quote) and its record anchored to 0G Storage. Compatible bases: `react-app`, `chat`, `tee-attested-api`, `mcp-agent` (`trade_signal` + `signal_verify` tools).

Deliberately advisory-only: NO order execution, NO transactions, NO auto-trading. A negative lib test enforces the execution-free public API surface (no `execute`/`trade`/`swap`/`send`/`transfer`) for the lifetime of the kit; `analyzeSignal` defaults safely to `hold` on malformed model output. Testnet-default (Galileo); mainnet and automated execution are intentionally out of scope.
