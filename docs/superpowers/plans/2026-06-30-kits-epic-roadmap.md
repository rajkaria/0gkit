---
title: Kits epic + carryover roadmap (K0–K11)
date: 2026-06-30
status: active
supersedes_sequence: 2026-05-23-post-v1-roadmap.md (re-sequences SP17–SP23 after the Kits epic; their scope is unchanged)
spec: ../specs/2026-06-30-0gkit-kits-design.md
---

# Kits epic + carryover roadmap

Single source of truth for execution order from 2026-06-30 onward. The **Kits
epic (K0–K4)** is the new priority; the **7 carried-over post-v1 sprints
(old SP17–SP23)** are re-sequenced to run after it, with their scope unchanged
(it still lives in [2026-05-23-post-v1-roadmap.md](2026-05-23-post-v1-roadmap.md)).

## Status as of 2026-06-30

- **Shipped:** SP1–SP16 (incl. v1.0.0, 18 packages @ 1.5.0). Defect-report feature
  (PR #52) shipped + published. See CLAUDE.md.
- **New:** Kits epic — design spec approved ([specs/2026-06-30-0gkit-kits-design.md](../specs/2026-06-30-0gkit-kits-design.md)).
- **Carryover (not yet started):** old SP17–SP23 from the post-v1 roadmap.

## Full sequence

| #   | Sprint                                | Theme                                                | Plan                                                             | Status |
| --- | ------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- | ------ |
| K0  | Kits engine + `agent-memory`          | overlay engine, `0g add`, `--kits`, `kits:check`     | [k0-kits-engine](2026-06-30-k0-kits-engine.md)                   | ready  |
| K1  | Verifiable AI + flagship              | `ai-oracle`, `sealed-inference`, `prediction-market` | [k1-verifiable-ai-market](2026-06-30-k1-verifiable-ai-market.md) | ready  |
| K2  | Durability + live data                | `durable-agent`, `live-feed`                         | [k2-durability-live-data](2026-06-30-k2-durability-live-data.md) | ready  |
| K3  | Assets + honest DeFi                  | `inft-studio`, `yield-intel`                         | [k3-assets-honest-defi](2026-06-30-k3-assets-honest-defi.md)     | ready  |
| K4  | Docs / GTM / publish                  | `/kits` docs, landing, authoring, publish            | [k4-docs-gtm-publish](2026-06-30-k4-docs-gtm-publish.md)         | ready  |
| K5  | (old SP17) `doctor --fix` + `0g test` | conformance runner + auto-fix                        | scope locked — full plan at execution                            | queued |
| K6  | (old SP18) `0g mcp init <agent>`      | cursor/claude/windsurf/codex MCP wiring              | scope locked — full plan at execution                            | queued |
| K7  | (old SP19) First-class Compute Router | `Compute.router()` (research-gated)                  | scope locked — full plan at execution                            | queued |
| K8  | (old SP20) `0g contracts import`      | chain-explorer ABI → typed client                    | scope locked — full plan at execution                            | queued |
| K9  | (old SP21) Foundry SDK refresh        | `@foundryprotocol/sdk` → `0gkit-* ^1.x` (cross-repo) | scope locked — full plan at execution                            | queued |
| K10 | (old SP22) Showcase app               | one public app on the published v1.x surface         | multi-PR — full plan at execution                                | queued |
| K11 | (old SP23) Community surface          | GitHub Discussions + landing footer                  | config + small PR                                                | queued |

## Carryover scope (unchanged — pointers into the post-v1 roadmap)

Each carryover sprint's detailed scope is already written; it is **re-sequenced,
not re-scoped**. When its turn comes, expand it to a full bite-sized plan via
`superpowers:writing-plans` (one session each), reading the linked section.

- **K5 / SP17** — `0g doctor --fix` (gen `.env` from `define0GConfig`, bump stale pins,
  RPC fallback hints) + `0g test [--suite] [--local|--galileo]` conformance runner
  (storage/compute/da/wallet round-trips). Lazy-imports `0gkit-testing` (D39).
  → [post-v1 §SP17](2026-05-23-post-v1-roadmap.md). **Synergy:** `0g test` should
  gain a `--kits` mode that runs each applied kit's conformance check.
- **K6 / SP18** — `0g mcp init <agent>` writes MCP config for cursor/claude/windsurf/codex,
  exposing the 0gkit tool set. → [post-v1 §SP18]. **Synergy:** kits with MCP adapters
  (agent-memory, durable-agent, sealed-inference) should auto-register their tools.
- **K7 / SP19** — `Compute.router({ model })` (provider selection + retries/fallback),
  `Compute.direct()` alias kept. Research-gated on 0G Router API. → [post-v1 §SP19].
  **Synergy:** every kit that calls compute should default to `router()`.
- **K8 / SP20** — `0g contracts import <address|abi>` (chainscan.0g.ai ABI fetch → SP4
  codegen). → [post-v1 §SP20]. **Synergy:** `inft-studio` docs reference it.
- **K9 / SP21** — Foundry SDK refresh: `@foundryprotocol/sdk` becomes a thin adapter over
  `0gkit-*`, bump to 1.1.0. Cross-repo (Foundryprotocol). → [post-v1 §SP21]. **Note:**
  storage-adapter draft exists in a prior session transcript.
- **K10 / SP22** — Showcase app (e.g. `0gkit-status` or `0gkit-prompt-receipts`) on
  `apps.0gkit.com`, consuming published packages. → [post-v1 §SP22]. **Synergy:** build it
  _by composing Kits_ — the ultimate dogfood + GTM proof.
- **K11 / SP23** — GitHub Discussions (Q&A/Show-and-tell/Ideas/RFCs) + landing community
  footer. → [post-v1 §SP23]. **Synergy:** add a "Show your kit" discussion category to seed
  community kits (ties to K4's authoring guide).

## Dependency notes

- K1–K3 depend on **K0** (engine + `templates/_kits` convention). K4 depends on K0–K3.
- Carryover K5–K8 are independent of the Kits engine and can interleave if priorities
  shift — but the default order keeps the GTM-critical Kits epic first.
- K10 (showcase) is strongest _after_ the Kits epic (compose the showcase from kits) and
  after K7 (router) + K5 (`0g test`).
- K9 (Foundry SDK) is cross-repo and parallel-safe with anything.

## Out of scope (unchanged from post-v1 roadmap)

- No CLI behaviour gated on Aristotle mainnet being live (D10). galileo + local devnet
  always work.
- No package renames / scope changes (`@foundryprotocol/0gkit-*`, repo `0gkit`) (D13).
- No paid community tiers.
- **Kits-specific:** engine stays `@foundryprotocol/*`-app-free (D78); finance kits stay
  testnet-default + execution-free; hackathon-track taxonomy is NOT adopted as 0gkit's own
  (unverified — see spec §1).
