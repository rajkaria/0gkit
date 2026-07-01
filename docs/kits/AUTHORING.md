# Build & publish a kit

Kits are the **shared skills repo for 0G**: package a reusable pattern once,
publish it to the catalog, and every project on 0gkit can install it with
`0g add <kit>`. This document explains how to add a new kit to
`templates/_kits/` so it can be applied via `0g add <kit>` or
`npm create 0gkit-app -- --kits <kit>`.

The same content is available as a rendered docs page at
[https://0gkit.com/kits/authoring](https://0gkit.com/kits/authoring).

## Quickstart — `0g kits new`

The fastest path is the scaffolder. It writes a registry-valid `kit.json`, a
dependency-injected portable core, one adapter per base, and (for React-capable
bases) a UI component + hook:

```bash
0g kits new my-feature \
  --title "My Feature" \
  --domain agent-infra \
  --summary "Does a useful thing on 0G." \
  --bases react-app,mcp-agent
```

Run inside a clone of `rajkaria/0gkit` and it writes into
`templates/_kits/<name>/`, drops a docs-page stub under
`apps/docs/app/kits/<name>/`, and prints the exact `nav.ts` line to register.
Then fill in the core + adapters, run `pnpm kits:check`, and open a PR. The rest
of this document is the reference behind what the scaffolder generates.

## Directory structure

```
templates/_kits/<kit-name>/
  kit.json               # manifest (required)
  lib/                   # portable tier (always applied)
    my-feature.ts
  adapters/
    react-app/           # files applied only when base = react-app
      app/api/…
    chat/
      app/api/…
    mcp-agent/
      src/tools/…
  ui/                    # React tier (applied for React-capable bases)
    components/
    hooks/
```

Templates live under `templates/_kits/` and are **not** listed in
`pnpm-workspace.yaml` (Decision D24). The engine fetches them at apply-time
via `giget`.

## kit.json schema

Every field is validated by `KitManifestSchema` (zod) in
`packages/0gkit-kits/src/manifest.ts`. A minimal valid `kit.json`:

```json
{
  "name": "my-feature",
  "title": "My Feature",
  "domain": "agent-infra",
  "summary": "One-sentence description of what the kit adds.",
  "compatibleBases": ["react-app", "chat"],
  "tiers": {
    "lib": ["lib/my-feature.ts"],
    "adapters": {
      "react-app": ["app/api/my-feature/route.ts"]
    },
    "ui": ["components/MyFeature.tsx"]
  },
  "env": [
    {
      "key": "OG_MY_VAR",
      "example": "my-value",
      "note": "What this env var controls"
    }
  ],
  "dependencies": {
    "@foundryprotocol/0gkit-storage": "^1.0.0"
  },
  "devDependencies": {},
  "requires": [],
  "composes": [],
  "conflicts": []
}
```

### Field reference

| Field             | Type                        | Required | Description                                                                                       |
| ----------------- | --------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `name`            | kebab-case string           | Yes      | Unique kit identifier — must match the directory name.                                            |
| `title`           | string                      | Yes      | Human-readable name shown in `0g kits list`.                                                      |
| `domain`          | enum                        | Yes      | One of `verifiable-ai`, `agent-infra`, `markets`, `assets`, `defi`.                               |
| `summary`         | string                      | Yes      | One-sentence description. Shown in `0g kits info`.                                                |
| `compatibleBases` | string[]                    | Yes      | Bases this kit supports (`react-app`, `chat`, `mcp-agent`, `storage-app`, `tee-attested-api`, …). |
| `tiers.lib`       | string[]                    | No       | Lib-tier file paths (relative to the kit root). Always applied.                                   |
| `tiers.adapters`  | Record<base, string[]>      | No       | Adapter files per base. Only the matching base's entry is applied.                                |
| `tiers.ui`        | string[]                    | No       | UI-tier files. Applied for React-capable bases only.                                              |
| `env`             | `{ key, example, note? }[]` | No       | Env vars added to `.env.example`. `note` is shown by `0g kits info`.                              |
| `dependencies`    | Record<string, string>      | No       | npm deps merged into the target project's `package.json`.                                         |
| `devDependencies` | Record<string, string>      | No       | Dev deps merged into the target project's `package.json`.                                         |
| `requires`        | string[]                    | No       | 0gkit package names the target base must already declare (e.g. `"0gkit-storage"`).                |
| `composes`        | string[]                    | No       | Other kit names auto-applied before this kit (deps-first, deduped, cycle-safe).                   |
| `conflicts`       | string[]                    | No       | Kit names that are illegal to apply together with this kit.                                       |

## 3-tier model

### lib tier

Portable TypeScript with all `@foundryprotocol/*` imports injected by the
adapter. The lib must compile and pass unit tests without any 0gkit package
installed (use injected mocks in tests). This tier is framework-agnostic and
must have zero hard `@foundryprotocol/*` imports at the lib level.

### adapters tier

One sub-directory per base. Each adapter file wires the real 0gkit packages
into the lib's injected-deps interfaces. Only the adapter matching the
detected base is written to the project. Adapters may import `@foundryprotocol/0gkit-*`
packages — they are kit dependencies listed in `kit.json` `dependencies`.

### ui tier

React components and hooks. Applied only for bases that include React
(`react-app`, `chat`). Must not import from adapter files — only from lib
interfaces and React.

## Neutrality rule (hard invariant)

No file in `templates/_kits/<kit>/` may import from `@foundryprotocol/*` app
packages (any package whose name does not start with `@foundryprotocol/0gkit-`).
This boundary is enforced at CI by `pnpm kits:check`.

## Running kits:check

```bash
pnpm kits:check
```

This validates:

1. Every `kit.json` parses against `KitManifestSchema`.
2. Every file listed in `tiers.lib`, `tiers.adapters`, and `tiers.ui` exists
   on disk under `templates/_kits/<kit>/`.
3. No kit file imports from `@foundryprotocol/*` app packages (neutrality boundary).

Run this before opening any PR that touches a kit or the engine.

## PR checklist

Before opening a PR that adds or modifies a kit:

- [ ] `kit.json` validates against `KitManifestSchema` (`pnpm kits:check` passes).
- [ ] `name` matches the directory name exactly (kebab-case).
- [ ] `compatibleBases` lists only bases that have a matching `adapters/<base>/`
      entry (or `lib`-only if no adapter is needed).
- [ ] Lib tier has zero hard `@foundryprotocol/*` imports — all deps injected
      by adapters.
- [ ] No file imports from Foundry app packages (neutrality rule).
- [ ] `env` lists every environment variable the kit reads, with `example`
      and `note`.
- [ ] `dependencies` lists every runtime npm package the kit's files import.
- [ ] `composes` is set if this kit requires another kit to be applied first.
- [ ] A doc page exists at `apps/docs/app/kits/<name>/page.mdx` and is
      registered in `apps/docs/lib/nav.ts` under the `"Kits"` section.
- [ ] `pnpm kits:check` passes locally.
- [ ] `pnpm format && pnpm docs:check` passes locally (nav-registered +
      prettier-clean — see K0 lesson: `docs:check` was once masked behind
      `format:check`; run **both**).

## Honesty guidelines

- **Attestation = signed receipt.** The operator key signs `digestJson(receipt)`
  via EIP-191 personal-sign; the signer is recovered with `recoverSigner`.
  There is no TEE quote verification in the current 0gkit stack. Badge text
  must always be **"✓ signature verified"** — never "TEE attested". Do not
  name `signEnvelope` or `verifyEnvelope` — those functions do not exist.
- **Real exports only.** Name only exports that actually exist in the package
  source. If unsure, `grep` the package before documenting.
- **Execution scope.** If a kit is read-only (e.g. `yield-intel`), say so
  explicitly and ship a non-removable `DemoBanner`-style disclaimer component.
- **Testnet defaults.** If the kit is testnet-only, set `OG_NETWORK=galileo`
  as the default and document that mainnet is out of scope.
