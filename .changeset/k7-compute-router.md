---
"@foundryprotocol/0gkit-compute": minor
---

Add `Compute.router()` — model-first inference that picks a provider for you.
With a `routerApiKey` it calls the real, OpenAI-compatible **0G Router** endpoint
(`router-api.0g.ai/v1`) with server-side selection + failover; without one it
selects **client-side** over `listProviders()` with retry/fallback (labelled as
such). Adds `Compute.direct()` (explicit-provider alias) and an additive per-call
`{ provider }` on `inference()` — the published `inference()` signature and
behaviour are unchanged (D13). New config: `routerApiKey`, `routerUrl`. New
exports: `RouterArgs`, `RouterResult`, `InferenceArgs`, `selectProviders`,
`pickProviderAddress`, `toProviderInfo`, `ProviderInfo`.
