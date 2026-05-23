---
"@foundryprotocol/0gkit-cli": patch
"create-0g-app": patch
"create-0gkit-app": patch
---

Fix three broken onboarding paths a fresh dev hits within the first minute:

- **`create-0gkit-app` tarball 404.** Default `OGKIT_TEMPLATE_REF` was pinned
  to the never-published git tag `v0.3.x`, so every
  `npm create 0gkit-app@latest` died on a `Failed to download
  https://api.github.com/repos/rajkaria/0gkit/tarball/v0.3.x: 404` before
  writing a single file. Defaulting to `main` instead — the always-green tip
  protected by the full CI pipeline. v1.x uses per-package npm tags
  (`@foundryprotocol/0gkit-core@1.0.1`), not a floating `v1.0.x` git tag, so
  there is no single tag that tracks the latest stable workspace state.
  `OGKIT_TEMPLATE_REF=<sha-or-tag>` env override unchanged for pinning to a
  specific revision.

- **CLI version drift.** `0g --version` printed `0.1.0` regardless of which
  release was installed (the constant was hardcoded in `program.ts`). Now read
  from `packages/0gkit-cli/package.json` at runtime via `readFileSync` (same
  pattern `create-0gkit-app` already uses), so `--version` always matches the
  installed tarball.

- **CLI heavy install.** `@foundryprotocol/0gkit-jobs` (which transitively
  requires the native `better-sqlite3`, ~minutes to compile on first install)
  was a static dependency, so `npm i @foundryprotocol/0gkit-cli` or
  `npx @foundryprotocol/0gkit-cli --help` paid that cost even when the user
  never touched `0g jobs *`. Jobs is now lazy-loaded via a computed-specifier
  dynamic import (same pattern as `loadFoundry`), and removed from
  `dependencies`. Devs who do want jobs subcommands install
  `@foundryprotocol/0gkit-jobs` explicitly; a missing-module error guides
  them.
