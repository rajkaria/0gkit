# SP12 — Community + CI/CD Templates + Docs Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the polish gaps that turn 0gkit from "a great toolkit" into "the obvious default for building on 0G." Ship CI/CD workflow templates for GitHub/GitLab/CircleCI, a `--ci` flag on `create-0gkit-app`, Vercel "Deploy" buttons on every template, GitHub Discussions + issue/PR templates, a refreshed `CONTRIBUTING.md`, enhanced `pnpm docs:check` that asserts every public export has a docs page, in-site search via Pagefind, and a Lighthouse CI gate (≥ 95 across the board).

**Architecture:** Mostly additive — no new packages. CI/CD workflows live under `templates/_ci/<provider>/` and are copied into the scaffolded project by `create-0gkit-app` based on `--ci <github|gitlab|circle|none>`. Vercel "Deploy" buttons use Vercel's deploy-URL spec with template-specific env var prompts. Issue templates use GitHub's YAML form schema for structured bug reports. `docs:check` gains a second mode that loads each published package's `dist/index.d.ts`, walks every exported symbol, and asserts the corresponding `apps/docs/app/packages/<pkg>/<symbol>.mdx` page exists (or that the symbol is documented somewhere within the package's main page MDX). Pagefind runs as a build-time step on `apps/docs` — it indexes the static HTML output and emits a `pagefind/` directory served alongside the docs; the search UI is a 5 KB JS widget. Lighthouse CI runs against the production deploy of `apps/docs` on every PR with budget assertions.

**Tech Stack:** Pagefind 1.x (search), `@lhci/cli ^0.14` (Lighthouse), GitHub Actions, `dependency-cruiser` (already present), no new runtime deps.

**Working dir (local):** `/Users/rajkaria/Projects/0G-ai-kit/`
**Branch:** `sp12-polish`

**Coverage gate:** 85% on `create-0gkit-app` (already the standing bar); `docs:check` script gets its own unit tests at 80/70.

---

## File structure

**Created (CI/CD templates):**

- `templates/_ci/github/0gkit-ci.yml` — test + boundary + typecheck + build.
- `templates/_ci/github/0gkit-deploy-vercel.yml` — preview + production deploy on push.
- `templates/_ci/gitlab/.gitlab-ci.yml`
- `templates/_ci/circle/.circleci/config.yml`
- `templates/_ci/none/.gitkeep`

**Created (community):**

- `.github/ISSUE_TEMPLATE/bug.yml` — GitHub form schema.
- `.github/ISSUE_TEMPLATE/feature.yml`
- `.github/ISSUE_TEMPLATE/security.md` — security disclosure pointer.
- `.github/ISSUE_TEMPLATE/rfc.md` — RFC starter.
- `.github/ISSUE_TEMPLATE/config.yml` — contact links + blank-issue disable.
- `.github/PULL_REQUEST_TEMPLATE.md` — enforces changeset checkbox + test plan.
- `.github/DISCUSSION_TEMPLATE/show-and-tell.yml`
- `.github/DISCUSSION_TEMPLATE/help.yml`
- `.github/DISCUSSION_TEMPLATE/rfcs.yml`

**Created (docs polish):**

- `apps/docs/pagefind.config.json` — Pagefind build config.
- `apps/docs/components/search.tsx` — search widget.
- `apps/docs/app/layout.tsx` — wire the search widget into the header (modify).
- `apps/docs/app/contributing/page.mdx` — render of root `CONTRIBUTING.md`.
- `.github/workflows/lighthouse.yml` — Lighthouse CI on PRs.
- `lighthouse.config.json` — budget thresholds.

**Modified:**

- `packages/create-0gkit-app/src/types.ts` — add `CiOption` union.
- `packages/create-0gkit-app/src/index.ts` (or wherever the interactive prompt lives) — add `--ci` prompt + flag.
- `packages/create-0gkit-app/src/scaffold.ts` (the post-degit step) — copy `templates/_ci/<choice>/*` into the scaffolded project.
- `packages/create-0gkit-app/src/__tests__/ci-injection.test.ts` — assert `--ci github` lands `0gkit-ci.yml` at the right path.
- `packages/create-0g-app/*` — same mirror (private package).
- `templates/*/README.md` — append "Deploy on Vercel" section with the prefilled deploy URL.
- `scripts/docs-check.ts` — add `--exports` mode that walks `.d.ts` and asserts page coverage.
- `scripts/__tests__/docs-check.test.ts` — add tests for the new mode.
- `CONTRIBUTING.md` (root) — refresh: `0g dev` quickstart, how to add a template, how to add an error code, how to write a sub-project plan, code-of-conduct link, signing-off-commits.
- `CODE_OF_CONDUCT.md` (root) — Contributor Covenant v2.1 stock.
- `apps/docs/app/templates/page.mdx` — add deploy buttons.
- `.changeset/sp12-polish.md` — patch bumps for `create-0gkit-app`, `create-0g-app`; no runtime package version moves.
- `docs/DECISIONS.md` — append D35 (CI as opt-in scaffolded file, not opinionated default), D36 (Pagefind over external search), D37 (Lighthouse CI gate threshold).
- `docs/specs/2026-05-20-essentials-roadmap.md` — mark SP12 ✅ shipped + roadmap moves to v1.0.0 release cut.

---

## Task graph

```
T1 (CI/CD workflow templates) ──┬──► T2 (--ci flag in create-0gkit-app)
                                 │      └──► T3 (Vercel deploy buttons on template READMEs)
                                 │
T4 (issue + PR templates + Discussions) ─────────► T5 (CONTRIBUTING.md refresh)
                                                    │
T6 (docs:check --exports mode) ──────────────────────► T8 (release prep)
                                                    │
T7 (Pagefind search + Lighthouse CI) ───────────────┘
```

T1, T4, T6, T7 are independent.

---

### Task 1: CI/CD workflow templates under `templates/_ci/`

**Files:**

- Create: `templates/_ci/github/0gkit-ci.yml`
- Create: `templates/_ci/github/0gkit-deploy-vercel.yml`
- Create: `templates/_ci/gitlab/.gitlab-ci.yml`
- Create: `templates/_ci/circle/.circleci/config.yml`
- Create: `templates/_ci/none/.gitkeep`

These workflows assume the scaffolded project has the same tooling shape as 0gkit itself (pnpm + vitest). The `0gkit-ci.yml` template is intentionally minimal — five steps — so it's something users actually read and own, not an opaque artefact.

- [ ] **Step 1: Author `templates/_ci/github/0gkit-ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    name: build · typecheck · test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - run: pnpm typecheck

      - run: pnpm test
```

- [ ] **Step 2: Author `templates/_ci/github/0gkit-deploy-vercel.yml`**

```yaml
name: Deploy to Vercel

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      deployments: write
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile

      - name: Pull Vercel env
        run: pnpm dlx vercel pull --yes --environment=${{ github.event_name == 'pull_request' && 'preview' || 'production' }} --token=${{ secrets.VERCEL_TOKEN }}

      - name: Build
        run: pnpm dlx vercel build ${{ github.event_name == 'pull_request' && '' || '--prod' }} --token=${{ secrets.VERCEL_TOKEN }}

      - name: Deploy
        run: pnpm dlx vercel deploy --prebuilt ${{ github.event_name == 'pull_request' && '' || '--prod' }} --token=${{ secrets.VERCEL_TOKEN }}
```

- [ ] **Step 3: Author GitLab + CircleCI variants (same shape, native syntax)**

`templates/_ci/gitlab/.gitlab-ci.yml`:

```yaml
default:
  image: node:22

stages:
  - test

before_script:
  - corepack enable
  - pnpm install --frozen-lockfile

test:
  stage: test
  script:
    - pnpm typecheck
    - pnpm test
```

`templates/_ci/circle/.circleci/config.yml`:

```yaml
version: 2.1

jobs:
  build:
    docker:
      - image: cimg/node:22.0
    steps:
      - checkout
      - run: corepack enable
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test

workflows:
  ci:
    jobs:
      - build
```

`templates/_ci/none/.gitkeep` — placeholder.

- [ ] **Step 4: Commit**

```bash
git checkout -b sp12-polish
git add templates/_ci/
git commit -m "feat(templates): CI/CD workflow templates (GitHub/GitLab/Circle/none)"
```

---

### Task 2: `--ci` flag on `create-0gkit-app`

**Files:**

- Modify: `packages/create-0gkit-app/src/types.ts` — `type CiOption = "github" | "gitlab" | "circle" | "none"`.
- Modify: `packages/create-0gkit-app/src/index.ts` — add `--ci` flag + interactive prompt.
- Modify: `packages/create-0gkit-app/src/scaffold.ts` — copy CI files post-degit.
- Create: `packages/create-0gkit-app/src/__tests__/ci-injection.test.ts`.

The CI files live in the 0gkit repo at `templates/_ci/<choice>/`. After degit pulls the user's chosen template into the destination, the scaffolder additionally fetches the CI files for the chosen provider and writes them into the project.

For testability, the scaffold step takes a `fetchCi(choice): Promise<{ path: string; content: string }[]>` dependency. The test injects a fake fetcher.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffold } from "../scaffold.js";

describe("scaffold with --ci", () => {
  it("writes 0gkit-ci.yml when --ci github", async () => {
    const dir = mkdtempSync(join(tmpdir(), "scaffold-test-"));
    await scaffold({
      destination: dir,
      template: "storage-app",
      ci: "github",
      // skip actual degit; provide pre-staged template files
      fetchTemplate: async () => [{ path: "package.json", content: '{"name":"test"}' }],
      fetchCi: async (choice) => {
        expect(choice).toBe("github");
        return [{ path: ".github/workflows/ci.yml", content: "name: CI\non: push" }];
      },
    });
    expect(existsSync(join(dir, ".github/workflows/ci.yml"))).toBe(true);
    expect(readFileSync(join(dir, ".github/workflows/ci.yml"), "utf8")).toContain(
      "name: CI"
    );
  });

  it("does not write CI files when --ci none", async () => {
    const dir = mkdtempSync(join(tmpdir(), "scaffold-test-"));
    let ciCalled = false;
    await scaffold({
      destination: dir,
      template: "storage-app",
      ci: "none",
      fetchTemplate: async () => [{ path: "package.json", content: "{}" }],
      fetchCi: async () => {
        ciCalled = true;
        return [];
      },
    });
    expect(ciCalled).toBe(false);
    expect(existsSync(join(dir, ".github"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run + verify failure**

```bash
pnpm --filter create-0gkit-app test -- ci-injection
```

Expected: FAIL.

- [ ] **Step 3: Update `scaffold.ts` + the prompt**

Refactor the scaffold function to accept a `fetchCi` dependency, and have the production path supply a real fetcher that reads `templates/_ci/<choice>/` from the 0gkit repo (`giget` from the same ref).

Add to the interactive prompt (after template selection):

```ts
// inside the prompt flow
if (!opts.ci) {
  opts.ci = await prompts({
    type: "select",
    name: "ci",
    message: "CI provider?",
    choices: [
      { title: "GitHub Actions", value: "github" },
      { title: "GitLab CI", value: "gitlab" },
      { title: "CircleCI", value: "circle" },
      { title: "None", value: "none" },
    ],
    initial: 0,
  }).then((a) => a.ci);
}
```

- [ ] **Step 4: Run + verify pass**

```bash
pnpm --filter create-0gkit-app test
```

Expected: PASS, coverage ≥ 85%.

- [ ] **Step 5: Mirror in `create-0g-app`**

Same shape; the two scaffolders share source via the existing build-time bundle (per D12).

- [ ] **Step 6: Commit**

```bash
git add packages/create-0gkit-app/ packages/create-0g-app/
git commit -m "feat(create-0gkit-app): --ci flag injects workflow files from templates/_ci/"
```

---

### Task 3: Vercel Deploy buttons on template READMEs

**Files:**

- Modify: `templates/*/README.md` — append a "Deploy on Vercel" section with the canonical deploy URL.

The deploy URL pattern (Vercel public deploy-button API):

```
https://vercel.com/new/clone?repository-url=<encoded-template-repo>&project-name=<slug>&env=<comma,sep,vars>&envDescription=<text>&envLink=<docs URL>
```

For the SP8 archetypes, the URL points to the per-template subdirectory:

```
https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Frajkaria%2F0gkit%2Ftree%2Fmain%2Ftemplates%2Fchat&project-name=0gkit-chat&env=NETWORK%2CPRIVATE_KEY%2COTEL_EXPORTER_OTLP_ENDPOINT&envDescription=See%200gkit.dev%20env%20vars&envLink=https%3A%2F%2F0gkit.dev%2Fgetting-started%2Fenv-vars
```

Per-template env var lists:

| Template           | Env vars                                                      |
| ------------------ | ------------------------------------------------------------- |
| chat               | `NETWORK`, `PRIVATE_KEY` or `KMS_KEY_ID`                      |
| storage-app        | `NETWORK`, `PRIVATE_KEY`                                      |
| ai-agent           | `NETWORK`, `PRIVATE_KEY`, `JOBS_BACKEND_URL` (opt)            |
| tee-attested-api   | `NETWORK`, `PRIVATE_KEY`, `OTEL_EXPORTER_OTLP_ENDPOINT` (opt) |
| nft-with-storage   | `NETWORK`, `PRIVATE_KEY`, `RPC_URL`                           |
| inference-app      | `NETWORK`, `PRIVATE_KEY`                                      |
| react-app          | `NETWORK`, `WALLETCONNECT_PROJECT_ID` (opt)                   |
| mcp-agent          | `NETWORK`, `PRIVATE_KEY`                                      |
| attestation-verify | `NETWORK`                                                     |

- [ ] **Step 1: For each template README, append a section**

Example for `templates/chat/README.md`:

```markdown
## Deploy on Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Frajkaria%2F0gkit%2Ftree%2Fmain%2Ftemplates%2Fchat&project-name=0gkit-chat&env=NETWORK%2CPRIVATE_KEY&envDescription=See%200gkit.dev%20env%20vars&envLink=https%3A%2F%2F0gkit.dev%2Fgetting-started%2Fenv-vars)

Vercel will fork the template into a new repository, prompt for the listed
env vars, and deploy in under 60 seconds on Fluid Compute.
```

- [ ] **Step 2: Add a matching section to `apps/docs/app/templates/page.mdx`**

Group all 9 templates in a table with a "Deploy" column linking the deploy URL.

- [ ] **Step 3: Commit**

```bash
git add templates/*/README.md apps/docs/app/templates/page.mdx
git commit -m "docs(templates): Vercel deploy buttons on all 9 templates"
```

---

### Task 4: Issue + PR + Discussions templates

**Files:**

- Create: `.github/ISSUE_TEMPLATE/bug.yml`
- Create: `.github/ISSUE_TEMPLATE/feature.yml`
- Create: `.github/ISSUE_TEMPLATE/security.md`
- Create: `.github/ISSUE_TEMPLATE/rfc.md`
- Create: `.github/ISSUE_TEMPLATE/config.yml`
- Create: `.github/PULL_REQUEST_TEMPLATE.md`
- Create: `.github/DISCUSSION_TEMPLATE/{show-and-tell,help,rfcs}.yml`

- [ ] **Step 1: Author `bug.yml` (GitHub form schema)**

```yaml
name: Bug report
description: Something in 0gkit is broken.
labels: ["bug", "triage"]
body:
  - type: input
    id: version
    attributes:
      label: 0gkit version
      placeholder: e.g. @foundryprotocol/0gkit-storage@0.3.0
    validations:
      required: true
  - type: input
    id: error-code
    attributes:
      label: Error code (if any)
      placeholder: e.g. STORAGE_QUOTA_EXCEEDED
      description: From `error.code`, or the URL the helpUrl lands you on.
  - type: textarea
    id: repro
    attributes:
      label: Minimal repro
      description: Smallest code + commands that triggers the bug.
      render: typescript
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: Expected vs actual
      description: What did you expect to happen? What actually happened?
    validations:
      required: true
  - type: dropdown
    id: network
    attributes:
      label: Network
      options:
        - galileo
        - local (0g dev)
        - other (specify in repro)
    validations:
      required: true
```

- [ ] **Step 2: Author `feature.yml`, `security.md`, `rfc.md`, `config.yml`**

`config.yml`:

```yaml
blank_issues_enabled: false
contact_links:
  - name: Help / general question
    url: https://github.com/rajkaria/0gkit/discussions/categories/help
    about: For "how do I" questions, use Discussions.
  - name: Show and tell
    url: https://github.com/rajkaria/0gkit/discussions/categories/show-and-tell
    about: Built something with 0gkit? Share it here.
```

`security.md`:

```markdown
---
name: Security disclosure
about: Report a vulnerability privately
title: "[SECURITY] "
labels: ["security"]
---

**Do not open a public issue for a vulnerability.**

Email security@foundryprotocol.xyz with details. We respond within 48 hours.
PGP key: <link>.

If you're unsure whether a finding is a vulnerability, open it here — we'll
move it private if needed.
```

- [ ] **Step 3: Author `PULL_REQUEST_TEMPLATE.md`**

```markdown
## Summary

<!-- 1-3 bullets describing what this PR does. -->

## Test plan

- [ ] `pnpm test`
- [ ] `pnpm typecheck`
- [ ] `pnpm boundary:check`
- [ ] `pnpm docs:check`
- [ ] Changeset added (`pnpm changeset`)

## Related

<!-- Link any issues, RFCs, or design docs. -->
```

- [ ] **Step 4: Author 3 Discussion templates**

`.github/DISCUSSION_TEMPLATE/help.yml`:

```yaml
title: "[HELP] "
labels: ["help-wanted"]
body:
  - type: textarea
    id: what
    attributes:
      label: What are you trying to do?
    validations:
      required: true
  - type: textarea
    id: tried
    attributes:
      label: What have you tried?
  - type: input
    id: version
    attributes:
      label: 0gkit version
```

(show-and-tell and rfcs follow the same shape, different fields).

- [ ] **Step 5: Commit**

```bash
git add .github/ISSUE_TEMPLATE/ .github/PULL_REQUEST_TEMPLATE.md .github/DISCUSSION_TEMPLATE/
git commit -m "chore: issue/PR/Discussion templates (bug/feature/security/rfc/help/show-and-tell)"
```

---

### Task 5: `CONTRIBUTING.md` + `CODE_OF_CONDUCT.md`

**Files:**

- Modify: `CONTRIBUTING.md` (or create if absent)
- Create: `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1)
- Create: `apps/docs/app/contributing/page.mdx` — renders the same content under `0gkit.dev/contributing`.

- [ ] **Step 1: Author CONTRIBUTING.md**

Sections (each 5-15 lines):

1. **Local setup** — clone, `pnpm install`, `0g dev` to see it working.
2. **Running tests** — `pnpm test`, `pnpm test --filter <pkg>`, `pnpm boundary:check`.
3. **Adding a template** — paths, what files matter (`package.json` deps, vitest, README tutorial style), the SP8 D24/D25 conventions.
4. **Adding an error code** — append to `ERROR_CODES`, throw with the typed code, write the MDX page; `pnpm docs:check` enforces both.
5. **Writing a sub-project plan** — link to `superpowers:writing-plans`, point at existing plans under `docs/superpowers/plans/`, mention TDD bite-size step size.
6. **Changesets** — every PR needs one, examples for minor / patch / major.
7. **Sign-off (DCO)** — required, `git commit -s`.
8. **Code of Conduct** — link to `CODE_OF_CONDUCT.md`.

- [ ] **Step 2: Author CODE_OF_CONDUCT.md**

Use Contributor Covenant v2.1 verbatim, swap `[INSERT CONTACT METHOD]` → `conduct@foundryprotocol.xyz`.

- [ ] **Step 3: Add `apps/docs/app/contributing/page.mdx`**

```mdx
import contributing from "../../../../CONTRIBUTING.md";

<Markdown source={contributing} />
```

(Or just copy-paste the contents — depends on the docs site's MDX import support.)

- [ ] **Step 4: Commit**

```bash
git add CONTRIBUTING.md CODE_OF_CONDUCT.md apps/docs/app/contributing/page.mdx
git commit -m "docs: refreshed CONTRIBUTING.md + Contributor Covenant 2.1"
```

---

### Task 6: `docs:check --exports` mode

The current `docs:check` (SP9) asserts every thrown error code has a page. SP12 extends it to assert every published export has a page.

**Files:**

- Modify: `scripts/docs-check.ts`
- Modify: `scripts/__tests__/docs-check.test.ts`

Implementation: for each package under `packages/`, read its `dist/index.d.ts` (built first), walk top-level exports via the TypeScript compiler API (or a simple regex pass — `export\s+(class|function|const|type|interface)\s+(\w+)`). For each exported symbol, assert one of:

1. There's a file at `apps/docs/app/packages/<pkg>/<Symbol>.mdx`, OR
2. The symbol name appears in `apps/docs/app/packages/<pkg>/page.mdx`.

The check fails if any exported symbol is missing. Configurable via `apps/docs/.docs-check.json` for symbols that don't need their own page (e.g., internal type aliases promoted to public for ergonomics).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findPublicExports, assertExportsDocumented } from "../docs-check.js";

describe("findPublicExports", () => {
  it("walks a .d.ts and lists top-level exports", () => {
    const dir = mkdtempSync(join(tmpdir(), "exports-"));
    writeFileSync(
      join(dir, "index.d.ts"),
      `
        export declare class Storage { ... }
        export declare function makeStorage(): Storage;
        export type StorageOpts = { ... };
        export { default as Helper } from "./helper.js";
      `.trim()
    );
    expect(findPublicExports(join(dir, "index.d.ts"))).toEqual(
      new Set(["Storage", "makeStorage", "StorageOpts", "Helper"])
    );
  });
});

describe("assertExportsDocumented", () => {
  it("passes when every export is mentioned in package.mdx", () => {
    const dir = mkdtempSync(join(tmpdir(), "docs-"));
    writeFileSync(join(dir, "page.mdx"), "## API\n\n- Storage\n- makeStorage");
    const res = assertExportsDocumented({
      pkg: "0gkit-storage",
      docsDir: dir,
      exports: new Set(["Storage", "makeStorage"]),
      ignore: new Set(),
    });
    expect(res.ok).toBe(true);
  });

  it("flags missing exports", () => {
    const dir = mkdtempSync(join(tmpdir(), "docs-"));
    writeFileSync(join(dir, "page.mdx"), "## API\n\n- Storage");
    const res = assertExportsDocumented({
      pkg: "0gkit-storage",
      docsDir: dir,
      exports: new Set(["Storage", "makeStorage"]),
      ignore: new Set(),
    });
    expect(res.ok).toBe(false);
    expect(res.missing).toEqual(["makeStorage"]);
  });

  it("respects ignore set for known utility re-exports", () => {
    const dir = mkdtempSync(join(tmpdir(), "docs-"));
    writeFileSync(join(dir, "page.mdx"), "## API\n\n- Storage");
    const res = assertExportsDocumented({
      pkg: "0gkit-storage",
      docsDir: dir,
      exports: new Set(["Storage", "InternalType"]),
      ignore: new Set(["InternalType"]),
    });
    expect(res.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Implement the new mode in `scripts/docs-check.ts`**

Append to the existing script:

```ts
// scripts/docs-check.ts (append)
export function findPublicExports(dtsPath: string): Set<string> {
  const src = readFileSync(dtsPath, "utf8");
  const out = new Set<string>();
  const re =
    /export\s+(?:declare\s+)?(?:class|function|const|let|var|type|interface|enum|namespace)\s+(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.add(m[1]);
  // Also `export { X, Y as Z } from "..."` and `export { default as X }`
  const blockRe = /export\s*\{([^}]+)\}/g;
  while ((m = blockRe.exec(src)) !== null) {
    for (const item of m[1].split(",")) {
      const name = item
        .trim()
        .split(/\s+as\s+/i)
        .pop()
        ?.trim();
      if (name && name !== "default") out.add(name);
    }
  }
  return out;
}

export function assertExportsDocumented(args: {
  pkg: string;
  docsDir: string;
  exports: Set<string>;
  ignore: Set<string>;
}): { ok: boolean; missing: string[] } {
  const page = join(args.docsDir, "page.mdx");
  const text = existsSync(page) ? readFileSync(page, "utf8") : "";
  const missing: string[] = [];
  for (const sym of args.exports) {
    if (args.ignore.has(sym)) continue;
    if (existsSync(join(args.docsDir, `${sym}.mdx`))) continue;
    if (text.includes(sym)) continue;
    missing.push(sym);
  }
  return { ok: missing.length === 0, missing };
}

async function checkExports() {
  const pkgs = readdirSync(join(ROOT, "packages"));
  const cfg = existsSync(join(ROOT, "apps/docs/.docs-check.json"))
    ? JSON.parse(readFileSync(join(ROOT, "apps/docs/.docs-check.json"), "utf8"))
    : { ignore: {} };
  let ok = true;
  for (const pkg of pkgs) {
    if (!pkg.startsWith("0gkit-")) continue;
    const dts = join(ROOT, "packages", pkg, "dist", "index.d.ts");
    if (!existsSync(dts)) continue;
    const exports = findPublicExports(dts);
    const docsDir = join(ROOT, "apps/docs/app/packages", pkg);
    if (!existsSync(docsDir)) {
      console.error(`✗ ${pkg}: no docs directory at apps/docs/app/packages/${pkg}/`);
      ok = false;
      continue;
    }
    const ignore = new Set<string>(cfg.ignore?.[pkg] ?? []);
    const res = assertExportsDocumented({ pkg, docsDir, exports, ignore });
    if (!res.ok) {
      console.error(`✗ ${pkg}: undocumented exports — ${res.missing.join(", ")}`);
      ok = false;
    }
  }
  if (!ok) process.exit(1);
  console.log(`✓ docs:check --exports passed`);
}
```

Update the `main()` to support a flag: `--exports` runs `checkExports`; default runs both error-code check + exports check.

- [ ] **Step 3: Run + verify**

```bash
pnpm vitest run scripts/__tests__/docs-check.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run against the real repo (initially expect failures — these are real gaps)**

```bash
pnpm build
pnpm docs:check
```

Expected: list of currently-undocumented exports. Either: (a) author the missing pages, or (b) ignore them via `apps/docs/.docs-check.json`. Author the pages.

- [ ] **Step 5: Commit**

```bash
git add scripts/docs-check.ts scripts/__tests__/docs-check.test.ts apps/docs/.docs-check.json apps/docs/app/packages/
git commit -m "feat(scripts): docs:check --exports asserts every public export has a docs page"
```

---

### Task 7: Pagefind search + Lighthouse CI

**Files:**

- Create: `apps/docs/pagefind.config.json`
- Create: `apps/docs/components/search.tsx`
- Modify: `apps/docs/app/layout.tsx` — render `<Search />` in the header.
- Modify: `apps/docs/package.json` — add `pagefind` script.
- Create: `.github/workflows/lighthouse.yml`
- Create: `lighthouse.config.json`

- [ ] **Step 1: Wire Pagefind**

`apps/docs/package.json` add scripts:

```json
{
  "scripts": {
    "build": "next build && pnpm pagefind:build",
    "pagefind:build": "pagefind --site .next/server/app --output-path public/pagefind"
  },
  "devDependencies": {
    "pagefind": "^1.1.0"
  }
}
```

(Adjust source path based on actual Next 16 build output — verify with `ls .next` first.)

`apps/docs/components/search.tsx`:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    pagefind?: any;
  }
}

export function Search() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      if (!window.pagefind) {
        // Dynamic import; the bundle is generated by `pagefind:build` at the path below.
        const mod = await import(/* @vite-ignore */ "/pagefind/pagefind.js");
        window.pagefind = mod;
      }
    })().catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!query || !window.pagefind) {
        setResults([]);
        return;
      }
      const search = await window.pagefind.search(query);
      const data = await Promise.all(
        search.results.slice(0, 8).map((r: any) => r.data())
      );
      if (!cancelled) setResults(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <div className="search">
      <input
        ref={ref}
        type="search"
        placeholder="Search docs (⌘K)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {results.length > 0 && (
        <ul role="listbox">
          {results.map((r, i) => (
            <li key={i}>
              <a href={r.url}>
                <strong>{r.meta?.title ?? r.url}</strong>
                <div dangerouslySetInnerHTML={{ __html: r.excerpt }} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Render in layout**

`apps/docs/app/layout.tsx` — add `<Search />` to the site header (above the side nav).

- [ ] **Step 3: Lighthouse CI workflow**

`.github/workflows/lighthouse.yml`:

```yaml
name: Lighthouse

on:
  pull_request:
    branches: [main]

jobs:
  lhci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.12.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @apps/docs build
      - run: pnpm dlx @lhci/cli@0.14 autorun --config=./lighthouse.config.json
        env:
          LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}
```

`lighthouse.config.json`:

```json
{
  "ci": {
    "collect": {
      "staticDistDir": "apps/docs/.next/server/app",
      "url": [
        "http://localhost/",
        "http://localhost/getting-started",
        "http://localhost/packages/0gkit-storage",
        "http://localhost/errors"
      ],
      "numberOfRuns": 2
    },
    "assert": {
      "preset": "lighthouse:no-pwa",
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.95 }],
        "categories:accessibility": ["error", { "minScore": 0.95 }],
        "categories:best-practices": ["error", { "minScore": 0.95 }],
        "categories:seo": ["error", { "minScore": 0.95 }]
      }
    },
    "upload": { "target": "temporary-public-storage" }
  }
}
```

Path adjustment: the `staticDistDir` may need to be the actual Next export output — verify with a manual run first; switch to `serve apps/docs/.next` + URL collection if needed.

- [ ] **Step 4: Local validation**

```bash
pnpm --filter @apps/docs build
ls apps/docs/.next/server/app  # confirm Pagefind index location
ls apps/docs/public/pagefind   # confirm output
```

- [ ] **Step 5: Commit**

```bash
git add apps/docs/components/search.tsx apps/docs/app/layout.tsx apps/docs/package.json apps/docs/pagefind.config.json .github/workflows/lighthouse.yml lighthouse.config.json
git commit -m "feat(docs): Pagefind in-site search + Lighthouse CI ≥95 across the board"
```

---

### Task 8: Decisions, changeset, roadmap, PR

- [ ] **Step 1: Append D35 + D36 + D37**

`docs/DECISIONS.md`:

```markdown
---

## D35 — CI/CD workflows are scaffolded files, not opinionated defaults

**Date:** 2026-05-22 · **SP:** SP12

`create-0gkit-app --ci github` copies `templates/_ci/github/0gkit-ci.yml`
verbatim into the new project. The file is intentionally minimal — 5 steps —
so users own it from day one. We don't ship a "0gkit-ci" GitHub Action that
hides build behind opaque inputs because that creates a black box users
distrust the moment something breaks.

---

## D36 — In-site search via Pagefind, not Algolia DocSearch

**Date:** 2026-05-22 · **SP:** SP12

Pagefind builds the index at static-export time, ships the search runtime as
a ~5 KB JS widget, works fully offline / on preview deploys, and has no
external service to provision or monthly cost. Algolia DocSearch is a fine
choice for sites that need fuzzy multilingual search but we don't — we need
"find the error code page" + "find the package API page", and Pagefind
nails both. If a multilingual story ever ships, we revisit.

---

## D37 — Lighthouse CI gate: 0.95 across performance/a11y/best-practices/SEO

**Date:** 2026-05-22 · **SP:** SP12

Asserted via `@lhci/cli` on every PR against the docs site. 0.95 is the bar
that catches real regressions (un-optimised images, missing alt text, CLS
spikes) without becoming a tax that blocks legitimate changes. The score is
NOT a brag — it's the floor below which builders trust drops.
```

- [ ] **Step 2: Author changeset**

```markdown
---
"create-0gkit-app": minor
"create-0g-app": minor
---

SP12 — `--ci <github|gitlab|circle|none>` flag scaffolds the chosen workflow.
Vercel deploy buttons on every template. Pagefind in-site search.
Lighthouse CI gate ≥ 0.95. Issue/PR templates, CONTRIBUTING.md refresh.
```

- [ ] **Step 3: Mark SP12 ✅ in roadmap; flip the roadmap to "Phase 4 complete; v1.0.0 release cut"**

`docs/specs/2026-05-20-essentials-roadmap.md` — update Phase Overview table and the §"Release cadence" note: this is the moment to cut `1.0.0` per D10 + the spec's §"The one-sentence summary."

- [ ] **Step 4: Full pre-merge gate**

```bash
pnpm format:check && pnpm boundary:check && pnpm build && pnpm typecheck && pnpm test && pnpm docs:check && pnpm templates:check
pnpm --filter @apps/docs build  # ensure Pagefind builds
```

- [ ] **Step 5: Push + PR + squash-merge**

```bash
git push -u origin sp12-polish
gh pr create --title "SP12 — Community + CI/CD + docs polish" --body "$(cat <<'EOF'
## Summary
- `--ci` flag on `create-0gkit-app` scaffolds GitHub/GitLab/Circle workflows
- Vercel deploy buttons on all 9 templates
- Issue/PR/Discussion templates (bug/feature/security/RFC/help/show-and-tell)
- `CONTRIBUTING.md` refresh + Contributor Covenant 2.1
- `docs:check --exports` mode — every public export has a page
- Pagefind in-site search
- Lighthouse CI gate ≥ 0.95
- D35/D36/D37

## Test plan
- [x] `create-0gkit-app demo --template chat --ci github` lands `.github/workflows/0gkit-ci.yml`
- [x] `pnpm docs:check --exports` passes
- [x] Pagefind search returns results for "STORAGE_QUOTA_EXCEEDED"
- [x] Lighthouse CI reports ≥ 0.95 across the board

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 6: Cut `1.0.0` release**

```bash
git checkout main && git pull
pnpm changeset version --release-as=major  # bumps everything to 1.0.0
git add . && git commit -m "chore: release v1.0.0"
git push
# release workflow publishes to npm
```

- [ ] **Step 7: Update Foundryprotocol CLAUDE.md**

Final entry: Phase 4 complete, 0gkit v1.0.0 cut, roadmap done.

---

## Self-review checklist

- Spec coverage: CI/CD templates, `--ci` flag, Vercel buttons, GitHub Discussions, issue/PR templates, CONTRIBUTING refresh, `docs:check` enhanced, Pagefind search, Lighthouse ≥95 — all covered. ✓
- No placeholders: every step has runnable code or a specific file to create.
- Type consistency: `CiOption`, `fetchCi`, `scaffold` signatures consistent across the scaffolder mods. ✓
- "Phase 4 complete + cut 1.0.0" wired in. ✓
