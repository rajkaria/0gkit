---
"@foundryprotocol/0gkit-testing": minor
---

Sync mocks to the real SP6/SP7 class shapes.

- `mockComputeClient.chat(messages)` is replaced by
  `mockComputeClient.inference({ messages, model?, temperature?, maxOutputTokens? })`,
  matching `Compute.inference()` in `@foundryprotocol/0gkit-compute`. Result
  shape is `{ output, receipt, raw }` (was `{ role, content, tx, raw }`).
- `mockComputeClient.discover()` is renamed to `listProviders()` to mirror
  `Compute.listProviders()`. The provider list is unchanged.
- `mockComputeClient.estimate({ messages, model?, maxOutputTokens? })` is new,
  returning a `ComputeEstimate`-shaped envelope.
- `mockComputeClient.inference(args, { dryRun: true })` is new, returning a
  `DryRunResult<InferenceResult>` envelope; the responder is not invoked.
- `mockStorageClient.estimate(data)` is new, returning a `StorageEstimate`-shaped
  envelope (256 KiB segments, 80k gas + 1 gwei per segment by default).
- `mockStorageClient.upload(data, { dryRun: true })` is new, returning a
  `DryRunResult<UploadResult>` envelope without mutating the in-memory store.

Templates that ship with `create-0gkit-app` can now use these mocks instead of
inlining their own fakes. Migration: `compute.chat(messages)` →
`compute.inference({ messages }).then(r => r.output)`; replace per-step
`reply.tx` with `reply.receipt`.
