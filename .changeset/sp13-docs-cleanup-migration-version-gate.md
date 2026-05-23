---
"@foundryprotocol/0gkit-storage": patch
"@foundryprotocol/0gkit-compute": patch
---

SP13 — docs cleanup + migration guide + version-sync CI gate.

- **Source-code deprecation messages** in `0gkit-storage` and `0gkit-compute`
  no longer promise removal "in v0.3" (we shipped v1.0). Both now say
  "removed in v2" so the post-v1 stability commitment is honest.
- No public API changes — patch-level releases only.

See [the docs site](https://docs.0gkit.com/migrate-from-official-sdks) for the
new migration guide from `@0gfoundation/0g-storage-ts-sdk` /
`@0gfoundation/0g-compute-ts-sdk`.
