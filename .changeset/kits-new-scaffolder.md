---
"@foundryprotocol/0gkit-cli": minor
---

Add `0g kits new <name>` — scaffold a brand-new kit you can publish to the shared
0G kit catalog. The command generates a registry-valid `kit.json`, a
dependency-injected portable `lib` core (zero `@foundryprotocol/*` imports, so it
passes the neutrality boundary), one adapter per compatible base
(`--bases react-app,mcp-agent,…`), and — for React-capable bases — a `ui`
component + hook. Inside the 0gkit monorepo it also drops a docs-page stub under
`apps/docs/app/kits/<name>/` and prints the exact `nav.ts` entry to register;
anywhere else it writes a self-contained kit folder plus a copy-into-the-catalog
runbook. Flags: `--title`, `--domain`, `--summary`, `--bases`, `--dir`,
`--dry-run`. Names are validated kebab-case, domains against the canonical five,
and an existing kit is never overwritten. File generation is a pure function so
the scaffold is unit-tested end to end without touching disk.
