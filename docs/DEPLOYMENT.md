# Deployment — `0gkit.com`

This monorepo deploys to **three independent Vercel projects**, all linked
to subdomains of `0gkit.com`. Each project is rooted at a different app
directory and built from `main`.

| Project            | Vercel root       | Domain                      | What lives there                                 |
| ------------------ | ----------------- | --------------------------- | ------------------------------------------------ |
| `0gkit-landing`    | `apps/landing`    | `0gkit.com` (apex + `www.`) | Marketing landing — the Google-discoverable root |
| `0gkit-docs`       | `apps/docs`       | `docs.0gkit.com`            | Full reference docs (MDX + Pagefind search)      |
| `0gkit-playground` | `apps/playground` | `playground.0gkit.com`      | Zero-setup browser console                       |

Three projects (rather than one with rewrites) means independent build
budgets, isolated Pagefind/search artefacts, and clean per-app preview URLs.
The trade-off is three Vercel project entries; for SEO this is a non-issue
because Google treats subdomains as separate properties and we want exactly
that — the landing page builds its own ranking signal for "0G SDK" /
"0G TypeScript" queries.

## First-time setup

### 1. Create three Vercel projects

For each app, run:

```bash
# from the repo root
vercel link --project 0gkit-landing
vercel --cwd apps/landing

vercel link --project 0gkit-docs
vercel --cwd apps/docs

vercel link --project 0gkit-playground
vercel --cwd apps/playground
```

Or via the Vercel dashboard: **Add New → Project → Import `rajkaria/0gkit`**
three times, each time setting **Root Directory** to the corresponding
`apps/<name>`. Vercel auto-detects Next.js 16 in each.

### 2. Wire the domains

In each Vercel project's **Settings → Domains**:

- `0gkit-landing`: add `0gkit.com` (apex) **and** `www.0gkit.com` (redirect
  to apex).
- `0gkit-docs`: add `docs.0gkit.com`.
- `0gkit-playground`: add `playground.0gkit.com`.

Vercel will show the exact DNS records needed (`A` for apex, `CNAME` for
subdomains). Apply them at the domain registrar.

### 3. Environment variables

The landing page is fully static (no runtime env). The docs site is also
static. The playground may need `OG_NETWORK` / `OG_RPC_URL` overrides if
you point it at non-default endpoints — see `apps/playground/README.md`.

### 4. Submit to Google Search Console

Once `0gkit.com` is live, register the property at
[search.google.com/search-console](https://search.google.com/search-console):

1. Add `0gkit.com` as a **Domain** property (covers all subdomains in one
   shot — verifies via DNS TXT record).
2. Submit the sitemap at `https://0gkit.com/sitemap.xml`.
3. Optionally also add `docs.0gkit.com` as a separate URL property if you
   want per-subdomain analytics.

Google typically discovers and indexes the homepage within 3–7 days.
Specific keyword rankings for "0G SDK", "0g chain typescript", "create
0gkit app" depend on inbound links — the 18 npm package `homepage` fields
now all point back to `0gkit.com`, which provides immediate high-authority
backlinks.

## CI behaviour

GitHub Actions does not deploy — Vercel's own Git integration owns
deployment. Each push to `main` triggers a production build of any project
whose root has changed; preview deployments fire automatically on PRs.

The repo's CI (`.github/workflows/ci.yml`) builds + tests every app and
package, including `apps/landing`, on every PR.

## Adding new apps

Add an `apps/<new-app>/package.json` and `apps/<new-app>/next.config.mjs`
(or equivalent), then point a new Vercel project at the new directory. The
`pnpm-workspace.yaml` glob (`apps/*`) picks the new app up automatically.

## Local development

```bash
pnpm install
pnpm --filter @foundryprotocol/0gkit-landing dev    # → localhost:3000
pnpm --filter @foundryprotocol/0gkit-docs dev       # → localhost:3001 (or next free)
pnpm --filter @foundryprotocol/0gkit-playground dev # → localhost:3002 (or next free)
```

All three apps can run in parallel via `pnpm dev` at the repo root (turbo
orchestrates the launches).
