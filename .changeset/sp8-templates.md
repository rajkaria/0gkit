---
"create-0gkit-app": minor
"create-0g-app": minor
---

SP8 — Template expansion: ship the five canonical archetypes.

Adds `chat`, `ai-agent`, `tee-attested-api`, `nft-with-storage` to the
`--template` registry. Refreshes `storage-app` with SP7 dry-run preflight
and dedup. Default `OGKIT_TEMPLATE_REF` bumped from `v0.2.x` → `v0.3.x` so
new scaffolds resolve against `@foundryprotocol/0gkit-*@0.3.0`.

Each template ships a tutorial-style README, vitest tests via inline fakes
matching the published 0gkit API surface, and a `pnpm dev` script that
integrates with `0g dev` where applicable. SP10 / SP11 hand-off paths are
documented inline in the `ai-agent` and `tee-attested-api` READMEs.
