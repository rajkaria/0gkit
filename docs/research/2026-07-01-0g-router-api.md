# T0 Research Gate — 0G Compute Router API

Date: 2026-07-01 · Sprint: K7 (`Compute.router()`) · Status: **VERIFIED — real endpoint exists**

## Question

Is there a public 0G **Router** endpoint distinct from per-provider
`broker.inference.listService()`? If so, what is its request shape, and does it
return a provider to call or proxy the call itself?

## Findings (cited)

**Yes — the 0G Compute Router is a real, shipped server endpoint.** It is *not*
the per-provider broker path; it is a distinct OpenAI-compatible HTTP gateway
that selects a provider server-side and settles payment from a single balance.

| Fact | Value | Source |
|---|---|---|
| Mainnet base URL | `https://router-api.0g.ai/v1` | [router/overview] |
| Testnet base URL | `https://router-api-testnet.integratenetwork.work/v1` | [router/overview] |
| Protocol | Pure **OpenAI-compatible HTTP** — "Any OpenAI client library works by changing `base_url` and `api_key`." No broker SDK required. | [router/faq] |
| Endpoint | `POST /v1/chat/completions` (streaming, tool-calling, reasoning tokens) | [router/overview] |
| Auth | `Authorization: Bearer <ROUTER_API_KEY>` | [router/overview] |
| Selection | Server-side. Routes by **lowest latency**, **lowest price** (`sort: 'price'`), or **pin to a provider**; built-in failover ("failover picks a healthy provider"). | [router/overview], [router/faq] |
| Models | Listed at `GET /v1/models`; names not enumerated in docs (browse the live catalog). | [router/faq] |
| API-key issuance | **Web UI only** (pc.0g.ai — wallet connect via MetaMask/WalletConnect or social sign-in via Privy). No documented programmatic/SDK issuance. | [router/faq] |
| Balance | Single unified on-chain balance; "Deposit 0G tokens, consume on-chain, settle periodically." | [router/overview] |

## Decision (honesty rule)

The Router endpoint is **confirmed**, so `Compute.router()` **wires the real
endpoint** — but note it uses a *different credential model* than our existing
`Compute.inference()` path:

- **`inference()`** — wallet-signer / broker SDK (`createZGComputeNetworkBroker`),
  per-provider `getServiceMetadata` + signed `getRequestHeaders`, per-request
  on-chain settlement. Credential = wallet private key (`signer` / `brokerKey`).
- **Router** — OpenAI-compatible HTTP, `Bearer <ROUTER_API_KEY>` (obtained from
  the pc.0g.ai Web UI), single pre-funded balance. **No wallet signer needed.**

Because the two auth models differ, `Compute.router()` is designed as:

1. **Primary — real 0G Router.** If a router API key is configured
   (`cfg.routerApiKey` or `ROUTER_API_KEY`), POST an OpenAI-compatible body to
   `${routerUrl}/chat/completions` with the Bearer key. `routerUrl` defaults by
   network (galileo → testnet URL, aristotle → mainnet URL) and is overridable.
   Server-side selection + failover; optional `sort` passthrough. This is the
   confirmed endpoint — no fabrication.
2. **Fallback — honest client-side routing.** If **no** router API key is set,
   `router()` reuses the wallet-signer path: `listProviders()` →
   `selectProviders()` (pure strategy) → `inference({ provider, … })` across
   candidates with retry/fallback. This is exactly what `templates/inference-app`
   hand-rolls today. It is **not** the 0G Router and is labelled as such in docs
   and a one-time runtime note ("set ROUTER_API_KEY to use the 0G Router").

Both paths return the same `InferenceResult` and share the public `router()`
surface — only the internal resolver differs. What we do **not** fabricate:
programmatic API-key issuance (user brings a key from the Web UI) and the exact
JSON placement of every routing knob beyond the documented `sort`.

[router/overview]: https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/overview
[router/faq]: https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/faq
