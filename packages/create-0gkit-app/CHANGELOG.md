# create-0gkit-app

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
