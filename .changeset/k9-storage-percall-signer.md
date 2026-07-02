---
"@foundryprotocol/0gkit-storage": minor
---

`Storage.upload` now accepts a per-call `UploadOptions` — `{ signer, uploadOptions,
txOptions }` — and returns `txSeq` on `UploadResult`. A per-call `signer` (a
ready ethers `Wallet`/`Signer`) takes precedence over the constructor
`signer`/`privateKey`, so browser-, remote-, or KMS-backed signers that never
expose a plaintext key can upload; `uploadOptions` and `txOptions` are forwarded
straight to the underlying 0G Storage SDK. Fully backward-compatible: the
no-arg `upload(data)` and `{ dryRun: true }` forms are unchanged, and `txSeq`
is optional. This lets `@foundryprotocol/sdk` (K9) become a thin adapter over
this package without losing its `{ signer }`-per-call + `txSeq` public surface.
