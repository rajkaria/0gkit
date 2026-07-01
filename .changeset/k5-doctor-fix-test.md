---
"@foundryprotocol/0gkit-testing": minor
"@foundryprotocol/0gkit-cli": minor
"@foundryprotocol/0gkit-kits": patch
---

K5: doctor --fix + 0g test conformance runner + .0gkit/kits.json manifest

- `@foundryprotocol/0gkit-testing`: new `runConformance()` orchestrator + conformance suites (storage, compute, da, wallet) — pure functions over injected factories, run offline in CI (D84).
- `@foundryprotocol/0gkit-cli`: new `0g test` command (lazy-imports `0gkit-testing` via computed specifier per D39) with `--suite/--local/--galileo/--kits` flags; `0g doctor --fix` with per-check `→ run <cmd> to fix` hints + `.env` gen / stale-pin bump / rpc fallback fixers (D85); production seam wired in `cli.ts` (real package.json pins + npm registry `latestVersion`).
- `@foundryprotocol/0gkit-kits`: `applyKit` now persists `.0gkit/kits.json` applied-kit manifest (`{ applied, base, at }`) — closes the K0 gap where applied-kit state was never recorded (D86).
