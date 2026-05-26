---
"@foundryprotocol/0gkit-core": minor
"create-0gkit-app": patch
"create-0g-app": patch
---

SP16: golden path + typed config

- New `define0GConfig({ server, client, edge })` typed env reader with zod validation. Server, browser-public (`NEXT_PUBLIC_*`), and edge-runtime slots. Generates an `.env.example` from the schema via `config.envExample()`.
- New `detectLocalDevnet({ rpcUrl })` — pure chainId probe; templates auto-fall-back to `network=local` when the local devnet is reachable.
- New `printFirstSuccess({ op, id })` banner helper with `FIRST_SUCCESS_MARKER = "[0gkit:first-success]"` (public contract token for log scrapers).
- All 9 templates migrated: every template ships `0g.config.ts`, `.env.example` derived from the schema, auto-devnet detection on boot, a first-success banner on the first 0G op, and a "What next?" README section.
- CI: `fresh-machine-smoke.yml` greps `npm run dev` output for the banner on storage-app.

Decisions: D71 (banner contract token), D72 (chainId-probe detection), D73 (zod in core).
