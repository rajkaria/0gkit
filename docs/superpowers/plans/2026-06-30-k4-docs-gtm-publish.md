---
title: K4 — Kits docs, GTM, authoring guide, publish
date: 2026-06-30
epic: kits
sprint: K4 (proposed SP21)
spec: ../specs/2026-06-30-0gkit-kits-design.md
status: ready
depends_on: K0–K3 (all 8 kits + engine merged)
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

# K4 — Docs, GTM, authoring, publish

## Goal

Turn the Kits engine + 8-kit catalog into a _discoverable, documented, shippable_
product surface, then publish. After K4: a `/kits` docs section, a landing "Kits"
page with the honest comparison, a community **authoring guide**, `kits:check`
gating fresh-machine-smoke + Lighthouse, and all changed packages published.

## Dependencies (already shipped)

- **K0** engine + `agent-memory`; **K1** ai-oracle/sealed-inference/prediction-market;
  **K2** durable-agent/live-feed; **K3** inft-studio/yield-intel. Per-kit doc _stubs_
  exist from K1–K3; this sprint fills them and adds the index, authoring, and GTM.

## Architecture

Docs in `apps/docs` (MDX + Pagefind, D36; Lighthouse ≥0.95, D37). Landing in
`apps/landing`. Authoring guide makes the engine a community surface. Publish via
the standard changesets → version-packages PR → Release flow (and the carried-over
publish gotchas: merge the version-packages PR; rotate `NPM_TOKEN` if Release 404s
on PUT — see CLAUDE.md `project_0gkit_publish_gotchas`).

## Working dir / Branch

- Working dir: `/Users/rajkaria/Projects/0G-ai-kit`
- Branch: `kits-k4-docs-gtm` (off `main` after K3 merges)

## File structure

**Created**

```
apps/docs/app/kits/page.mdx                      # /kits index: catalog by domain + how kits work
apps/docs/app/kits/authoring/page.mdx            # contribute a kit (kit.json, tiers, kits:check)
docs/kits/AUTHORING.md                           # repo-side authoring reference (linked from docs)
apps/landing/app/kits/page.tsx                   # GTM "Kits" page + honest comparison table
apps/landing/components/KitsShowcase.tsx
```

**Modified**

```
apps/docs/app/kits/<each-kit>/page.mdx           # fill the 8 stubs: what it adds, bases, env, usage, 0gkit pkgs leaned on
apps/docs/app/templates/page.mdx                 # cross-link "add a kit after scaffolding"
apps/docs/components/Nav.*                        # add "Kits" section
README.md                                         # Kits section (upgradeable + typed + multi-framework)
apps/landing/components/{Hero,TrustSignals}.tsx   # Kits call-out
.github/workflows/fresh-machine-smoke.yml         # kits:check across all 8 kits on Node 20/22/24
lighthouse.config.json                            # include /kits routes in the LHCI run
.changeset/kits-gtm-docs.md                        # docs/landing only — no package code change unless registry codegen touched
```

## Task graph

```
T1 per-kit docs (×8)  ─┐
T2 /kits index + nav  ─┼─ T4 landing GTM page + comparison
T3 authoring guide    ─┘            │
                                     ▼
                     T5 CI (kits:check + LHCI) ── T6 publish
```

---

## Tasks

### T1 — Fill the 8 per-kit doc pages

- [ ] For each kit (`agent-memory`, `ai-oracle`, `sealed-inference`,
      `prediction-market`, `durable-agent`, `live-feed`, `inft-studio`, `yield-intel`):
      document **what it adds** (file tree), **compatible bases**, **env vars** (from
      `kit.json`), **usage** (`0g add <kit>` + a code snippet), and **which 0gkit
      packages it leans on**. `yield-intel` leads with the demo/safety disclaimer.
- [ ] **Run** — `pnpm docs:check` (incl. `--versions`) → green.
- [ ] **Commit**: `docs(kits): per-kit reference pages`.

### T2 — `/kits` index + nav

- [ ] **Implement** — `apps/docs/app/kits/page.mdx`: catalog grouped by domain
      (Verifiable AI / Agent Infra / Markets / Assets / DeFi), a "How kits work"
      section (3-tier model, composition, upgradeable-vs-codedump), and the
      `0g add` / `--kits` / `0g kits list` commands. Add a "Kits" nav section.
- [ ] **Run** — `pnpm docs:check` + build → green. **Commit**: `docs(kits): /kits index + nav`.

### T3 — Authoring guide (community surface)

- [ ] **Implement** — `docs/kits/AUTHORING.md` + `apps/docs/app/kits/authoring/page.mdx`:
      how to add `templates/_kits/<kit>/`, write a valid `kit.json`, pick tiers/bases,
      and pass `kits:check`; the neutrality rule (no `@foundryprotocol/*` app imports);
      PR checklist. This is the "community kits" GTM angle.
- [ ] **Commit**: `docs(kits): authoring guide`.

### T4 — Landing GTM page + honest comparison

- [ ] **Implement** — `apps/landing/app/kits/page.tsx` + `KitsShowcase.tsx`: lead
      with _upgradeable + typed + multi-framework_; include the **honest comparison
      table** from the spec (§1) — and a footnote that the comparison is based on
      create-0g-dapp's public README, not its (private) source, plus a note that
      hackathon-track names are theirs, not an official 0G taxonomy.
- [ ] Hero/TrustSignals call-out + `0g add` one-liner.
- [ ] **Commit**: `feat(landing): Kits GTM page + honest comparison`.

### T5 — CI gates

- [ ] **Implement** — `fresh-machine-smoke.yml`: `kits:check` over all 8 kits ×
      bases on Node 20/22/24. `lighthouse.config.json`: add `/kits` + a kit page.
- [ ] **Run** — full gate incl. `lhci` ≥0.95 on the new routes → green.
- [ ] **Commit**: `ci(kits): kits:check matrix + LHCI on /kits`.

### T6 — Publish

- [ ] **Implement** — `.changeset/kits-gtm-docs.md` if any package surface changed
      (otherwise docs/landing-only). Ensure K0–K3 changesets are present.
- [ ] **Merge** the version-packages PR (the publish gotcha: it must be merged or
      nothing publishes). Run Release. If `changeset publish` 404s on PUT for all
      packages → rotate `NPM_TOKEN` automation token + re-run (per CLAUDE.md gotcha).
- [ ] **Verify** — `npm view @foundryprotocol/0gkit-kits version` + `create-0g-app`
  - `0gkit-cli` reflect the new minor; `npm create 0gkit-app -- --kits prediction-market`
    works against the published registry on a clean machine.
- [ ] **Commit/close** — PR `K4 — Kits docs + GTM + publish`. Squash-merge on green.

## Self-review checklist

- [ ] All 8 kit pages complete (no stubs left); `docs:check --versions` green.
- [ ] `/kits` index + nav + authoring guide live; Pagefind indexes them.
- [ ] Landing comparison is honest (sourced-from-README footnote; no unverified track claims).
- [ ] LHCI ≥0.95 on `/kits` routes.
- [ ] `kits:check` runs in fresh-machine-smoke across all 8 kits on 3 Node versions.
- [ ] Published packages verified on npm; clean-machine `--kits` scaffold works.
- [ ] Publish gotchas honored (version-packages PR merged; NPM_TOKEN rotation path noted).
