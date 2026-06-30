---
"@foundryprotocol/0gkit-kits": patch
---

K2 durability: registry embeds `durable-agent` and `live-feed` kits.

`durable-agent` — resumable multi-step agent loop on 0gkit-jobs with per-step
durability on 0G Storage (step-completion ledger prevents re-running completed
steps on restart) and OpenTelemetry span tracing per executed step (noop when
OTel is not configured). Compatible with all five base templates.

`live-feed` — reorg-safe live social feed on 0G Storage + 0gkit-indexer. Posts
are content-addressed blobs in 0G Storage; Indexer reorg-safety is active when
`OG_FEED_CONTRACT_ADDRESS` is set (storage-only mode otherwise). Includes React
UI (`useLiveFeed` hook + `FeedStream` component). Compatible with `react-app`
and `chat` bases.
