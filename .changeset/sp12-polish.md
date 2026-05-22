---
"create-0gkit-app": minor
"create-0g-app": minor
---

SP12 — Polish + community + v1.0.0 prep.

- `--ci <github|gitlab|circle|none>` flag on `create-0gkit-app` scaffolds
  the chosen CI workflow files alongside the template.
- Vercel "Deploy" buttons on all 9 template READMEs and the docs
  `templates` page.
- Issue / PR / Discussion templates: bug.yml, feature.yml, security.md,
  rfc.md, plus help.yml / show-and-tell.yml / rfcs.yml under
  `.github/DISCUSSION_TEMPLATE/`.
- `CONTRIBUTING.md` refresh (8 sections: setup, tests, templates, error
  codes, sub-project plans, changesets, DCO sign-off, code of conduct)
  - Contributor Covenant 2.1 contact wired.
- `pnpm docs:check` gains an `--exports` mode that asserts every public
  export of every `0gkit-*` package is documented.
- Pagefind in-site search wired into the docs layout (lazy-loaded on
  focus, ⌘K shortcut).
- Lighthouse CI workflow with a ≥ 0.95 gate across
  performance/a11y/best-practices/SEO.
- Decisions D35–D37.
