# `@foundryprotocol/0gkit-landing`

The marketing landing page for [0gkit.com](https://0gkit.com).

Sibling of `apps/docs` (→ `docs.0gkit.com`) and `apps/playground` (→
`playground.0gkit.com`). The three are deployed as three independent Vercel
projects, all sourced from this monorepo.

## Stack

- **Next.js 16** App Router (SSG by default — every section is server-rendered;
  the only client island is the install-command copy button).
- **React 19**.
- **Tailwind v4** via `@tailwindcss/postcss`.
- **No external runtime deps** beyond `next` / `react` / `react-dom`. The OG
  image uses Next's built-in `next/og`. Structured data is hand-rolled JSON-LD.

## Local dev

```bash
pnpm install
pnpm --filter @foundryprotocol/0gkit-landing dev
# → http://localhost:3000
```

## Build

```bash
pnpm --filter @foundryprotocol/0gkit-landing build
pnpm --filter @foundryprotocol/0gkit-landing start
```

## SEO surface

- `app/sitemap.ts` — root + key docs URLs.
- `app/robots.ts` — allow-all with sitemap reference.
- `app/opengraph-image.tsx` — generated 1200×630 PNG via `next/og`.
- `components/StructuredData.tsx` — `SoftwareApplication`, `Organization`,
  `WebSite`, and `FAQPage` JSON-LD so Google can render rich SERP snippets
  (including the install command).
- Layout-level `Metadata` covers Open Graph, Twitter card, canonical URL,
  robots, and a targeted keyword list.

## Deployment

This app is deployed on Vercel at **0gkit.com**. Project root: `apps/landing`.

See [`docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md) at the repo root for the
full three-project (landing / docs / playground) Vercel layout.
