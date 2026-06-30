---
"@foundryprotocol/0gkit-kits": minor
"@foundryprotocol/0gkit-cli": minor
"create-0g-app": minor
"create-0gkit-app": minor
---

K0: Kits engine — overlay scaffolding system with agent-memory reference kit

- New package `@foundryprotocol/0gkit-kits`: manifest schema (zod), kit registry with base-compat filter, `applyKit` overlay engine (3-tier: lib/adapters/ui), `resolveTiers` for base×kit matrix, giget-based overlay fetch, composition with dedup + cycle safety (`composes[]`), conflict detection (`conflicts[]`). Engine imports only `zod` + `giget` + `node:*` — zero toolkit deps (D78).
- Reference kit `agent-memory`: lib interface, `mcp-agent` + `react-app` adapters, React UI hook. Kit self-supplies `@foundryprotocol/0gkit-storage` in its own `dependencies` so it is self-sufficient on any base (D80).
- CLI: new `0g kits list` / `0g kits info <kit>` subcommands; new `0g add <kit>` shorthand applying a kit to the current project.
- `create-0g-app` / `create-0gkit-app`: `--kits` flag for scaffold-time kit selection; kit picker interactive flow.
- Boundary rules: `no-kits-engine-to-0gkit` (engine must never import any `@foundryprotocol/*`), `no-kit-overlay-to-foundry-app` (overlays may use `0gkit-*` but never non-0gkit Foundry packages). `boundary:check` scope extended to `templates/_kits`.
- CI: `kits-check` job in `fresh-machine-smoke.yml` running `pnpm kits:check` on Node 20, 22, 24.

Decisions: D77 (overlays via giget, not published packages), D78 (engine purity), D79 (3-tier model), D80 (kit composition rules).
