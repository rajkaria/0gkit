---
"@foundryprotocol/0gkit-kits": patch
---

K1: Verifiable AI kits — ai-oracle, sealed-inference, prediction-market

- New kit `ai-oracle`: signed AI answers anchored to 0G Storage (default) or on-chain via `Anchor.sol` opt-in. Uses `@foundryprotocol/0gkit-compute` + `@foundryprotocol/0gkit-attestation` (`signEnvelope` / `digestJson`). Attestation is an **operator-signed receipt** (EIP-191; badge = "✓ signature verified") — not TEE-quote. On-chain anchor via `@foundryprotocol/0gkit-contracts` is env-flag-gated (`OG_ANCHOR_ONCHAIN=1`). Compatible bases: `react-app`, `chat`, `tee-attested-api`, `mcp-agent`.
- New kit `sealed-inference`: signed inference with a React badge (`SealedChat`) that reflects the live `verifyEnvelope` result — never hardcoded green. Injected `Attestor` interface for future TEE-quote swapout. Compatible bases: `react-app`, `chat`, `tee-attested-api`, `mcp-agent`.
- New kit `prediction-market`: AI-resolved proof-anchored prediction market (open → bet → resolve → settle). Composes `ai-oracle` so the engine auto-applies it first; both kits' deps merge into `package.json`. Compatible bases: `react-app`, `chat`, `tee-attested-api`.
- Registry codegen (`scripts/gen-registry.mjs`) now embeds all 4 kits in `registry.generated.ts`; `kits:check` CI gate is composition-aware (15/15 combos pass).

Decisions: D81 (honest signed-receipt attestation, injected Attestor seam), D82 (0G Storage anchor default + opt-in on-chain via Anchor.sol), D83 (registry codegen auto-formats output).
