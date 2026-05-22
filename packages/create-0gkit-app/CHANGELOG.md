# create-0gkit-app

## 0.4.0

### Minor Changes

- 61cd0a9: SP8 — Template expansion: ship the five canonical archetypes.

  Adds `chat`, `ai-agent`, `tee-attested-api`, `nft-with-storage` to the
  `--template` registry. Refreshes `storage-app` with SP7 dry-run preflight
  and dedup. Default `OGKIT_TEMPLATE_REF` bumped from `v0.2.x` → `v0.3.x` so
  new scaffolds resolve against `@foundryprotocol/0gkit-*@0.3.0`.

  Each template ships a tutorial-style README, vitest tests via inline fakes
  matching the published 0gkit API surface, and a `pnpm dev` script that
  integrates with `0g dev` where applicable. SP10 / SP11 hand-off paths are
  documented inline in the `ai-agent` and `tee-attested-api` READMEs.

## 0.3.0

### Minor Changes

- 94e7fd6: Make `create-0gkit-app` the working npm-create front door. It now bundles the
  scaffolder implementation, exposes the `create-0gkit-app` binary, and replaces
  the old defensive shim that redirected to the unavailable `create-0g-app` name.

## 0.2.0

### Minor Changes

- 89148d3: SP1: `npm create 0g-app@latest <name>` scaffolds a runnable 0G app in seconds.
  Templates: storage-app, inference-app, attestation-verify, mcp-agent, react-app.
  Pairs with SP2's `0g dev` for zero-faucet local development.
  `create-0gkit-app` is a defensive alias that redirects to the canonical name.
