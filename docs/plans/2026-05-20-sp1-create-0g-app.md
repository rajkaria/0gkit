# SP1 — `create-0g-app` (npm initializer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm create 0g-app@latest <name>` scaffolds a runnable 0G app — template fetched, deps installed, git initialised, `.env.example` filled, `0g dev` recommended — in ≤45s on a clean machine with a warm npm cache. Bonus: a single banner at the end tells the developer exactly what command to run next.

**Architecture:** A new published-but-not-monorepo-internal package `create-0g-app` (at the npm root, not under `@foundryprotocol/`) sits at the front of the toolchain. It uses `giget` to degit a template subtree from a pinned git ref of the `0G-ai-kit` repo, runs the user's package manager to install, optionally `git init`s, writes `.env.example` based on the selected network, and prints a "you are here / next step" banner. Defaults: template `storage-app`, network `local` (paired with SP2), package manager auto-detected from environment, install + git init enabled.

**Tech Stack:** Node 20+ ESM, TypeScript 5.6, `commander@^14`, `@clack/prompts` (interactive prompts), `giget` (degit), `execa` (running pnpm/npm/yarn), `kleur` is **not** used (we ship a 15-line internal ANSI helper per D4), `tsup`, `vitest`.

**Decisions referenced:** D5 (`create-0g-app` is the primary name; `create-0gkit-app` is a defensive shim), D2 (workspace tooling), D4 (CLI conventions).

**Depends on:** SP2 (the scaffolded app's `--network local` flag is meaningless without `0g dev`). **Ships together with SP2** as Phase 1.

---

## File Structure

**Create:**

- `packages/create-0g-app/package.json`
- `packages/create-0g-app/tsup.config.ts`
- `packages/create-0g-app/tsconfig.json`
- `packages/create-0g-app/vitest.config.ts`
- `packages/create-0g-app/README.md`
- `packages/create-0g-app/src/index.ts` — public entry, exports `run()` for tests
- `packages/create-0g-app/src/bin.ts` — thin shebang wrapper that calls `run()`
- `packages/create-0g-app/src/types.ts` — `CreateOptions`, `TemplateName`, `Network`
- `packages/create-0g-app/src/templates.ts` — template catalogue + fetcher (giget)
- `packages/create-0g-app/src/prompts.ts` — interactive mode (clack)
- `packages/create-0g-app/src/pm.ts` — package manager detection (pnpm/npm/yarn/bun)
- `packages/create-0g-app/src/env.ts` — `.env.example` writer per network
- `packages/create-0g-app/src/banner.ts` — final "next step" banner
- `packages/create-0g-app/src/git.ts` — `git init` + first commit
- `packages/create-0g-app/src/ansi.ts` — minimal color helper (matches the existing one in `0gkit-cli`)
- `packages/create-0g-app/src/__tests__/templates.test.ts`
- `packages/create-0g-app/src/__tests__/pm.test.ts`
- `packages/create-0g-app/src/__tests__/env.test.ts`
- `packages/create-0g-app/src/__tests__/git.test.ts`
- `packages/create-0g-app/src/__tests__/e2e.test.ts` — full happy-path against `storage-app` in a tmpdir
- `packages/create-0gkit-app/package.json` — 3-line shim (defensive name registration)
- `packages/create-0gkit-app/src/bin.ts`
- `.changeset/sp1-create-0g-app.md`
- `apps/docs/app/getting-started/create-0g-app/page.mdx`

**Modify:**

- `README.md` (root) — replace current "Quick start" with `npm create 0g-app demo` as the first thing
- `apps/docs/app/getting-started/page.mdx` — same
- `pnpm-workspace.yaml` — already globs `packages/*`
- `templates/*/README.md` — each gets a "this template was scaffolded by `create-0g-app`" footer
- `.github/workflows/ci.yml` — add the e2e smoke test

---

### Task 1: Bootstrap `create-0g-app` package

**Files:**

- Create: `packages/create-0g-app/package.json`
- Create: `packages/create-0g-app/tsconfig.json`
- Create: `packages/create-0g-app/tsup.config.ts`
- Create: `packages/create-0g-app/vitest.config.ts`
- Create: `packages/create-0g-app/src/bin.ts`
- Create: `packages/create-0g-app/src/index.ts`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "create-0g-app",
  "version": "0.1.0",
  "description": "Scaffold a 0G app in seconds. `npm create 0g-app@latest`.",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": { "create-0g-app": "./dist/bin.js" },
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "clean": "rimraf dist"
  },
  "dependencies": {
    "@clack/prompts": "^0.7.0",
    "commander": "^14.0.0",
    "execa": "^9.0.0",
    "giget": "^1.2.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "rimraf": "^6.0.1",
    "tsup": "^8.3.0",
    "typescript": "^5.6.3",
    "vitest": "^2.1.0",
    "@vitest/coverage-v8": "^2.1.0"
  },
  "engines": { "node": ">=20.10" },
  "license": "MIT",
  "keywords": ["0g", "0gkit", "scaffold", "create", "initializer"]
}
```

- [ ] **Step 2: Write `tsup.config.ts`**

```ts
import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/index.ts", "src/bin.ts"],
  format: ["esm"],
  dts: { entry: "src/index.ts" },
  clean: true,
  banner: { js: "#!/usr/bin/env node" }, // bin.ts shebang
  treeshake: true,
});
```

(Implementer note: the `banner` injects the shebang into both bundles. If a non-bin output gets the shebang it's harmless — but if you want cleaner separation, split into two `defineConfig` calls.)

- [ ] **Step 3: Write minimal `bin.ts` + `index.ts`**

```ts
// src/index.ts
export async function run(argv: string[]): Promise<number> {
  return 0;
}
```

```ts
// src/bin.ts
import { run } from "./index.js";
run(process.argv).then((code) => process.exit(code));
```

- [ ] **Step 4: Build + verify shebang**

```bash
pnpm --filter create-0g-app build
head -1 packages/create-0g-app/dist/bin.js  # must be #!/usr/bin/env node
chmod +x packages/create-0g-app/dist/bin.js
node packages/create-0g-app/dist/bin.js  # exits 0
```

- [ ] **Step 5: Commit**

```bash
git add packages/create-0g-app
git commit -m "feat(create): bootstrap create-0g-app package skeleton"
```

---

### Task 2: Template catalogue + giget fetcher

**Files:**

- Create: `packages/create-0g-app/src/templates.ts`
- Create: `packages/create-0g-app/src/__tests__/templates.test.ts`
- Create: `packages/create-0g-app/src/types.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TEMPLATES, fetchTemplate, isValidTemplateName } from "../templates.js";

describe("templates catalogue", () => {
  it("includes all 5 Phase-1 templates", () => {
    const names = TEMPLATES.map((t) => t.name);
    expect(names).toContain("storage-app");
    expect(names).toContain("inference-app");
    expect(names).toContain("attestation-verify");
    expect(names).toContain("mcp-agent");
    expect(names).toContain("react-app");
  });

  it("rejects unknown templates", () => {
    expect(isValidTemplateName("totally-fake")).toBe(false);
    expect(isValidTemplateName("storage-app")).toBe(true);
  });

  it.skipIf(!process.env.CI_HAS_NET)(
    "fetches storage-app into a tmpdir",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "cga-"));
      await fetchTemplate({ name: "storage-app", dest: dir });
      expect(existsSync(join(dir, "package.json"))).toBe(true);
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      expect(pkg.name).toBe("storage-app");
    },
    30_000
  );
});
```

- [ ] **Step 2: Confirm failure**

Run: `pnpm --filter create-0g-app test templates`

- [ ] **Step 3: Implement `templates.ts` + `types.ts`**

```ts
// src/types.ts
export type TemplateName =
  | "storage-app"
  | "inference-app"
  | "attestation-verify"
  | "mcp-agent"
  | "react-app";
export type Network = "local" | "galileo";
export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

export interface CreateOptions {
  name: string;
  template: TemplateName;
  network: Network;
  packageManager: PackageManager;
  install: boolean;
  git: boolean;
  dest: string; // absolute path where the app will be created
  example: boolean; // true if interactive picker was used
}
```

```ts
// src/templates.ts
import { downloadTemplate } from "giget";
import { TemplateName } from "./types.js";

export const TEMPLATES: { name: TemplateName; description: string }[] = [
  { name: "storage-app", description: "Upload + download a file, verify Merkle root." },
  { name: "inference-app", description: "OpenAI-shaped chat against 0G Compute." },
  {
    name: "attestation-verify",
    description: "Parse + verify a TEE attestation report.",
  },
  { name: "mcp-agent", description: "Expose 0G primitives as MCP tools." },
  { name: "react-app", description: "Next.js app using 0gkit React hooks." },
];

export function isValidTemplateName(s: string): s is TemplateName {
  return TEMPLATES.some((t) => t.name === s);
}

const TEMPLATE_REF = process.env.OGKIT_TEMPLATE_REF ?? "v0.2.x";

export async function fetchTemplate(opts: {
  name: TemplateName;
  dest: string;
}): Promise<void> {
  await downloadTemplate(
    `github:rajkaria/0gkit/templates/${opts.name}#${TEMPLATE_REF}`,
    { dir: opts.dest, force: false, install: false }
  );
}
```

- [ ] **Step 4: Run → Step 5: Commit**

```bash
pnpm --filter create-0g-app test templates
git add packages/create-0g-app/src/templates.ts packages/create-0g-app/src/types.ts packages/create-0g-app/src/__tests__/templates.test.ts
git commit -m "feat(create): template catalogue + giget fetcher"
```

---

### Task 3: Package manager detection

**Files:**

- Create: `packages/create-0g-app/src/pm.ts`
- Create: `packages/create-0g-app/src/__tests__/pm.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { detectPackageManager } from "../pm.js";

describe("detectPackageManager", () => {
  it("returns pnpm when npm_config_user_agent indicates pnpm", () => {
    expect(
      detectPackageManager({
        env: { npm_config_user_agent: "pnpm/9.12.0 npm/? node/v22.0.0" },
      })
    ).toBe("pnpm");
  });
  it("returns yarn when yarn", () => {
    expect(
      detectPackageManager({
        env: { npm_config_user_agent: "yarn/4.0.0 npm/? node/v22.0.0" },
      })
    ).toBe("yarn");
  });
  it("returns bun when bun", () => {
    expect(detectPackageManager({ env: { npm_config_user_agent: "bun/1.1.0" } })).toBe(
      "bun"
    );
  });
  it("falls back to npm", () => {
    expect(detectPackageManager({ env: {} })).toBe("npm");
  });
});
```

- [ ] **Step 2: Confirm fail → Step 3: Implement**

```ts
// pm.ts
import type { PackageManager } from "./types.js";

export function detectPackageManager(
  opts: { env?: NodeJS.ProcessEnv } = {}
): PackageManager {
  const ua = opts.env?.npm_config_user_agent ?? process.env.npm_config_user_agent ?? "";
  if (ua.startsWith("pnpm")) return "pnpm";
  if (ua.startsWith("yarn")) return "yarn";
  if (ua.startsWith("bun")) return "bun";
  return "npm";
}

export function installCommand(pm: PackageManager): string[] {
  if (pm === "pnpm") return ["pnpm", "install"];
  if (pm === "yarn") return ["yarn"];
  if (pm === "bun") return ["bun", "install"];
  return ["npm", "install"];
}

export function devCommand(pm: PackageManager, script = "dev"): string {
  if (pm === "pnpm") return `pnpm ${script}`;
  if (pm === "yarn") return `yarn ${script}`;
  if (pm === "bun") return `bun run ${script}`;
  return `npm run ${script}`;
}
```

- [ ] **Step 4: Run → Step 5: Commit**

```bash
pnpm --filter create-0g-app test pm
git add packages/create-0g-app/src/pm.ts packages/create-0g-app/src/__tests__/pm.test.ts
git commit -m "feat(create): package manager detection from npm user-agent"
```

---

### Task 4: `.env.example` writer per network

**Files:**

- Create: `packages/create-0g-app/src/env.ts`
- Create: `packages/create-0g-app/src/__tests__/env.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { writeEnvExample, envFor } from "../env.js";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("envFor", () => {
  it("local network points all URLs at localhost ports", () => {
    const env = envFor("local");
    expect(env.NETWORK).toBe("local");
    expect(env.RPC_URL).toBe("http://127.0.0.1:8545");
    expect(env.STORAGE_URL).toBe("http://127.0.0.1:5678");
    expect(env.COMPUTE_URL).toBe("http://127.0.0.1:5679");
    expect(env.DA_URL).toBe("http://127.0.0.1:5680");
    // PRIVATE_KEY left blank; comment tells dev to grab from `0g dev` output
    expect(env.PRIVATE_KEY).toBe("");
  });
  it("galileo network points to real endpoints", () => {
    const env = envFor("galileo");
    expect(env.NETWORK).toBe("galileo");
    expect(env.RPC_URL).toMatch(/^https?:\/\//);
  });
});

describe("writeEnvExample", () => {
  it("writes a .env.example with comments", () => {
    const dir = mkdtempSync(join(tmpdir(), "cga-env-"));
    writeEnvExample({ network: "local", dest: dir });
    const out = readFileSync(join(dir, ".env.example"), "utf8");
    expect(out).toContain("NETWORK=local");
    expect(out).toContain("# Paste a private key from `0g dev` output");
    expect(out).toContain("PRIVATE_KEY=");
  });
});
```

- [ ] **Step 2: Confirm fail → Step 3: Implement**

```ts
// env.ts
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Network } from "./types.js";

export function envFor(network: Network): Record<string, string> {
  if (network === "local") {
    return {
      NETWORK: "local",
      RPC_URL: "http://127.0.0.1:8545",
      STORAGE_URL: "http://127.0.0.1:5678",
      COMPUTE_URL: "http://127.0.0.1:5679",
      DA_URL: "http://127.0.0.1:5680",
      PRIVATE_KEY: "",
    };
  }
  return {
    NETWORK: "galileo",
    RPC_URL: "https://evmrpc-testnet.0g.ai",
    STORAGE_URL: "https://indexer-storage-testnet-turbo.0g.ai",
    COMPUTE_URL: "",
    DA_URL: "",
    PRIVATE_KEY: "",
  };
}

export function writeEnvExample(opts: { network: Network; dest: string }): void {
  const env = envFor(opts.network);
  const lines: string[] = ["# 0g app — environment", `# Network: ${opts.network}`, ""];
  for (const [k, v] of Object.entries(env)) {
    if (k === "PRIVATE_KEY") {
      lines.push(
        opts.network === "local"
          ? "# Paste a private key from `0g dev` output. Never use this key in production."
          : "# Paste a Galileo-funded private key. Use a secure key loader (e.g. fromKMS) in prod."
      );
    }
    lines.push(`${k}=${v}`);
  }
  writeFileSync(join(opts.dest, ".env.example"), lines.join("\n") + "\n");
}
```

- [ ] **Step 4: Run → Step 5: Commit**

```bash
pnpm --filter create-0g-app test env
git add packages/create-0g-app/src/env.ts packages/create-0g-app/src/__tests__/env.test.ts
git commit -m "feat(create): .env.example writer per network"
```

---

### Task 5: `git init` + first commit

**Files:**

- Create: `packages/create-0g-app/src/git.ts`
- Create: `packages/create-0g-app/src/__tests__/git.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initGitRepo } from "../git.js";

describe("initGitRepo", () => {
  it("creates a .git directory and an initial commit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cga-git-"));
    writeFileSync(join(dir, "README.md"), "# test");
    const result = await initGitRepo({ dest: dir });
    expect(result.ok).toBe(true);
    expect(existsSync(join(dir, ".git"))).toBe(true);
  }, 10_000);

  it("returns ok: false (not throw) when git is not installed", async () => {
    const result = await initGitRepo({ dest: "/nope", gitBin: "/nope/git" });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/git/i);
  });
});
```

- [ ] **Step 2: Confirm fail → Step 3: Implement**

```ts
// git.ts
import { execa } from "execa";

export interface InitGitResult {
  ok: boolean;
  reason?: string;
}

export async function initGitRepo(opts: {
  dest: string;
  gitBin?: string;
}): Promise<InitGitResult> {
  const git = opts.gitBin ?? "git";
  try {
    await execa(git, ["init", "--initial-branch=main"], { cwd: opts.dest });
    await execa(git, ["add", "."], { cwd: opts.dest });
    await execa(
      git,
      [
        "-c",
        "user.email=hello@0gkit.dev",
        "-c",
        "user.name=create-0g-app",
        "commit",
        "-m",
        "chore: bootstrap from create-0g-app",
      ],
      { cwd: opts.dest }
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}
```

- [ ] **Step 4: Run → Step 5: Commit**

```bash
pnpm --filter create-0g-app test git
git add packages/create-0g-app/src/git.ts packages/create-0g-app/src/__tests__/git.test.ts
git commit -m "feat(create): git init + first commit"
```

---

### Task 6: ANSI helper + final "next step" banner

**Files:**

- Create: `packages/create-0g-app/src/ansi.ts`
- Create: `packages/create-0g-app/src/banner.ts`
- Create: `packages/create-0g-app/src/__tests__/banner.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { renderBanner } from "../banner.js";

describe("renderBanner", () => {
  it("includes cd + dev command + 0g dev hint when local", () => {
    const out = renderBanner({
      name: "demo",
      packageManager: "pnpm",
      network: "local",
      template: "storage-app",
    });
    expect(out).toContain("cd demo");
    expect(out).toContain("pnpm dev");
    expect(out).toContain("0g dev");
    expect(out).toContain("storage-app");
  });

  it("omits 0g dev hint when galileo", () => {
    const out = renderBanner({
      name: "demo",
      packageManager: "npm",
      network: "galileo",
      template: "react-app",
    });
    expect(out).not.toContain("0g dev");
    expect(out).toContain("npm run dev");
  });
});
```

- [ ] **Step 2: Confirm fail → Step 3: Implement `banner.ts` + `ansi.ts`**

```ts
// ansi.ts (15-line internal helper per D4)
const isTTY = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code: string) => (s: string) => (isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
export const bold = wrap("1");
export const dim = wrap("2");
export const green = wrap("32");
export const cyan = wrap("36");
export const yellow = wrap("33");
```

```ts
// banner.ts
import { bold, cyan, green, dim } from "./ansi.js";
import { devCommand } from "./pm.js";
import type { Network, PackageManager, TemplateName } from "./types.js";

export function renderBanner(opts: {
  name: string;
  packageManager: PackageManager;
  network: Network;
  template: TemplateName;
}): string {
  const out: string[] = [
    "",
    green(bold("✓")) +
      ` Created ${bold(opts.name)} from template ${cyan(opts.template)}`,
    "",
    bold("Next steps:"),
    `  ${cyan("cd")} ${opts.name}`,
  ];
  if (opts.network === "local") {
    out.push(
      `  ${cyan("0g dev")}                      ${dim("# start local devnet (separate terminal)")}`
    );
  }
  out.push(
    `  ${cyan(devCommand(opts.packageManager))}              ${dim("# run the app")}`
  );
  out.push("");
  if (opts.network === "local") {
    out.push(
      dim("Tip: 0g dev prints 10 funded accounts. Copy one PRIVATE_KEY into .env.")
    );
  } else {
    out.push(dim("Tip: visit https://faucet.0g.ai to fund your Galileo account."));
  }
  out.push("");
  return out.join("\n");
}
```

- [ ] **Step 4: Run → Step 5: Commit**

```bash
pnpm --filter create-0g-app test banner
git add packages/create-0g-app/src/ansi.ts packages/create-0g-app/src/banner.ts packages/create-0g-app/src/__tests__/banner.test.ts
git commit -m "feat(create): next-step banner + ANSI helper"
```

---

### Task 7: Interactive prompts (clack)

**Files:**

- Create: `packages/create-0g-app/src/prompts.ts`
- (No vitest for clack interactive flow — covered by e2e in Task 9. We DO unit-test the validation helpers.)

- [ ] **Step 1: Write failing tests for validation only**

```ts
import { describe, it, expect } from "vitest";
import { validateProjectName } from "../prompts.js";

describe("validateProjectName", () => {
  it.each([
    ["my-app", true],
    ["MY_APP", true],
    ["my-app-2", true],
    ["", false],
    [".", false],
    ["..", false],
    ["my app", false], // no spaces
    ["a/b", false], // no slashes
    ["my-very-long-".repeat(20), false], // 200+ chars rejected
  ])("'%s' → %s", (input, expected) => {
    expect(validateProjectName(input).ok).toBe(expected);
  });
});
```

- [ ] **Step 2: Confirm fail → Step 3: Implement**

```ts
// prompts.ts
import * as p from "@clack/prompts";
import { TEMPLATES, isValidTemplateName } from "./templates.js";
import type { CreateOptions, TemplateName, Network, PackageManager } from "./types.js";
import { detectPackageManager } from "./pm.js";

export function validateProjectName(name: string): { ok: boolean; reason?: string } {
  if (!name) return { ok: false, reason: "Project name is required" };
  if (name === "." || name === "..")
    return { ok: false, reason: "Name cannot be . or .." };
  if (!/^[a-zA-Z0-9_-]+$/.test(name))
    return { ok: false, reason: "Only letters, digits, _ and - allowed" };
  if (name.length > 64) return { ok: false, reason: "Name too long (max 64)" };
  return { ok: true };
}

export async function interactivePrompts(
  seed: Partial<CreateOptions>
): Promise<CreateOptions | null> {
  p.intro("create-0g-app");
  const name =
    seed.name ??
    (await p.text({
      message: "Project name?",
      placeholder: "my-0g-app",
      validate: (v) => {
        const r = validateProjectName(v);
        return r.ok ? undefined : r.reason;
      },
    }));
  if (p.isCancel(name)) {
    p.cancel("Cancelled.");
    return null;
  }

  const template =
    seed.template ??
    (await p.select({
      message: "Template?",
      options: TEMPLATES.map((t) => ({
        value: t.name,
        label: t.name,
        hint: t.description,
      })),
      initialValue: "storage-app",
    }));
  if (p.isCancel(template)) {
    p.cancel("Cancelled.");
    return null;
  }

  const network =
    seed.network ??
    (await p.select({
      message: "Network?",
      options: [
        { value: "local", label: "local", hint: "Use 0g dev — recommended" },
        { value: "galileo", label: "galileo", hint: "0G testnet" },
      ],
      initialValue: "local",
    }));
  if (p.isCancel(network)) {
    p.cancel("Cancelled.");
    return null;
  }

  const install =
    seed.install ??
    (await p.confirm({ message: "Install dependencies?", initialValue: true }));
  if (p.isCancel(install)) {
    p.cancel("Cancelled.");
    return null;
  }

  const git =
    seed.git ??
    (await p.confirm({ message: "Initialize a git repository?", initialValue: true }));
  if (p.isCancel(git)) {
    p.cancel("Cancelled.");
    return null;
  }

  return {
    name: name as string,
    template: template as TemplateName,
    network: network as Network,
    packageManager: (seed.packageManager ?? detectPackageManager()) as PackageManager,
    install: install as boolean,
    git: git as boolean,
    dest: "", // filled by run()
    example: true,
  };
}
```

- [ ] **Step 4: Run → Step 5: Commit**

```bash
pnpm --filter create-0g-app test prompts
git add packages/create-0g-app/src/prompts.ts
git commit -m "feat(create): interactive prompts with clack"
```

---

### Task 8: Wire `run()` — the full orchestrator

**Files:**

- Modify: `packages/create-0g-app/src/index.ts`

- [ ] **Step 1: Replace placeholder `run()` with the real one**

```ts
// src/index.ts
import { Command } from "commander";
import { resolve, isAbsolute, join } from "node:path";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { execa } from "execa";
import { TEMPLATES, fetchTemplate, isValidTemplateName } from "./templates.js";
import { detectPackageManager, installCommand } from "./pm.js";
import { writeEnvExample } from "./env.js";
import { initGitRepo } from "./git.js";
import { renderBanner } from "./banner.js";
import { interactivePrompts, validateProjectName } from "./prompts.js";
import type { CreateOptions, TemplateName, Network, PackageManager } from "./types.js";

export interface RunDeps {
  cwd?: string;
  log?: (m: string) => void;
  err?: (m: string) => void;
}

export async function run(argv: string[], deps: RunDeps = {}): Promise<number> {
  const log = deps.log ?? ((m: string) => process.stdout.write(m + "\n"));
  const err = deps.err ?? ((m: string) => process.stderr.write(m + "\n"));
  const cwd = deps.cwd ?? process.cwd();

  const program = new Command("create-0g-app")
    .version("0.1.0")
    .description("Scaffold a 0G app in seconds.")
    .argument("[name]", "Project name (interactive prompt if omitted)")
    .option(
      "-t, --template <name>",
      `Template (${TEMPLATES.map((t) => t.name).join("|")})`
    )
    .option("-n, --network <name>", "Network: local | galileo", "local")
    .option("--package-manager <pm>", "Package manager: pnpm | npm | yarn | bun")
    .option("--no-install", "Skip dependency install")
    .option("--no-git", "Skip git init")
    .exitOverride();

  let parsed;
  try {
    parsed = program.parse(argv);
  } catch (e: any) {
    return e.exitCode ?? 1;
  }
  const args = parsed.processedArgs;
  const opts = parsed.opts();
  const seedName = args[0] as string | undefined;

  // Validate template flag early
  if (opts.template && !isValidTemplateName(opts.template)) {
    err(
      `Unknown template: ${opts.template}. Valid: ${TEMPLATES.map((t) => t.name).join(", ")}`
    );
    return 1;
  }

  // Decide flow: --template+name means non-interactive; else interactive
  let final: CreateOptions | null;
  if (seedName && opts.template) {
    const v = validateProjectName(seedName);
    if (!v.ok) {
      err(`Invalid name: ${v.reason}`);
      return 1;
    }
    final = {
      name: seedName,
      template: opts.template as TemplateName,
      network: (opts.network as Network) ?? "local",
      packageManager: (opts.packageManager as PackageManager) ?? detectPackageManager(),
      install: opts.install !== false,
      git: opts.git !== false,
      dest: "",
      example: false,
    };
  } else {
    final = await interactivePrompts({
      name: seedName,
      template: opts.template as TemplateName | undefined,
      network: opts.network as Network | undefined,
      packageManager: opts.packageManager as PackageManager | undefined,
      install: opts.install,
      git: opts.git,
    });
    if (!final) return 1;
  }

  // Resolve dest
  const dest = isAbsolute(final.name) ? final.name : resolve(cwd, final.name);
  if (existsSync(dest) && readdirSync(dest).length > 0) {
    err(`Directory ${dest} is not empty.`);
    return 1;
  }
  mkdirSync(dest, { recursive: true });
  final.dest = dest;

  // 1. fetch template
  log(`→ Fetching template ${final.template}`);
  await fetchTemplate({ name: final.template, dest });

  // 2. write .env.example
  writeEnvExample({ network: final.network, dest });

  // 3. install
  if (final.install) {
    log(`→ Installing dependencies with ${final.packageManager}`);
    const [bin, ...args] = installCommand(final.packageManager);
    await execa(bin, args, { cwd: dest, stdio: "inherit" });
  }

  // 4. git init
  if (final.git) {
    log(`→ Initialising git repository`);
    const r = await initGitRepo({ dest });
    if (!r.ok) err(`(warn) git init skipped: ${r.reason}`);
  }

  // 5. banner
  log(
    renderBanner({
      name: final.name,
      packageManager: final.packageManager,
      network: final.network,
      template: final.template,
    })
  );

  return 0;
}
```

- [ ] **Step 2: Update `bin.ts` to slice `argv`**

```ts
// bin.ts
import { run } from "./index.js";
run(process.argv).then((code) => process.exit(code));
```

- [ ] **Step 3: Manual smoke**

```bash
pnpm --filter create-0g-app build
node packages/create-0g-app/dist/bin.js my-demo --template storage-app --network local --no-install --no-git
ls /tmp/whatever/my-demo   # should contain package.json + .env.example
```

- [ ] **Step 4: Commit**

```bash
git add packages/create-0g-app/src/index.ts packages/create-0g-app/src/bin.ts
git commit -m "feat(create): wire up full create-0g-app orchestrator"
```

---

### Task 9: e2e smoke test (happy path)

**Files:**

- Create: `packages/create-0g-app/src/__tests__/e2e.test.ts`

- [ ] **Step 1: Write the e2e test**

```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../index.js";

describe.skipIf(!process.env.CI_HAS_NET)(
  "create-0g-app e2e (storage-app, local, no install)",
  () => {
    it("scaffolds a complete project", async () => {
      const cwd = mkdtempSync(join(tmpdir(), "cga-e2e-"));
      const code = await run(
        [
          "node",
          "create-0g-app",
          "demo",
          "--template",
          "storage-app",
          "--network",
          "local",
          "--no-install",
          "--no-git",
        ],
        { cwd }
      );
      expect(code).toBe(0);
      expect(existsSync(join(cwd, "demo", "package.json"))).toBe(true);
      expect(existsSync(join(cwd, "demo", ".env.example"))).toBe(true);
      expect(existsSync(join(cwd, "demo", "src"))).toBe(true);
    }, 60_000);
  }
);
```

- [ ] **Step 2: Run** (gated by `CI_HAS_NET=1`):

```bash
CI_HAS_NET=1 pnpm --filter create-0g-app test e2e
```

- [ ] **Step 3: Commit**

```bash
git add packages/create-0g-app/src/__tests__/e2e.test.ts
git commit -m "test(create): e2e smoke for happy-path scaffolding"
```

---

### Task 10: `create-0gkit-app` defensive shim package

**Files:**

- Create: `packages/create-0gkit-app/package.json`
- Create: `packages/create-0gkit-app/src/bin.ts`
- Create: `packages/create-0gkit-app/tsup.config.ts`
- Create: `packages/create-0gkit-app/README.md`

- [ ] **Step 1: Write the shim**

```json
{
  "name": "create-0gkit-app",
  "version": "0.1.0",
  "description": "Defensive name registration — use `npm create 0g-app` instead.",
  "type": "module",
  "bin": { "create-0gkit-app": "./dist/bin.js" },
  "files": ["dist", "README.md"],
  "scripts": { "build": "tsup" },
  "devDependencies": { "tsup": "^8.3.0" },
  "license": "MIT"
}
```

```ts
// src/bin.ts
console.error(
  "\nuse `npm create 0g-app` instead — `create-0gkit-app` is a defensive alias.\n"
);
process.exit(1);
```

```ts
// tsup.config.ts
import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/bin.ts"],
  format: ["esm"],
  banner: { js: "#!/usr/bin/env node" },
  clean: true,
});
```

- [ ] **Step 2: Build → Step 3: Commit**

```bash
pnpm --filter create-0gkit-app build
git add packages/create-0gkit-app
git commit -m "feat(create): defensive create-0gkit-app shim → redirects to create-0g-app"
```

---

### Task 11: CI smoke + publish wiring

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml` (changeset publish picks up new packages automatically; verify the matrix includes them)

- [ ] **Step 1: Add a CI job that runs the e2e smoke**

```yaml
create-0g-app-e2e:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
      with: { version: 9.12.0 }
    - uses: actions/setup-node@v4
      with: { node-version: 22, cache: pnpm }
    - run: pnpm install --frozen-lockfile
    - run: pnpm --filter create-0g-app build
    - name: Smoke create-0g-app
      run: |
        cd $(mktemp -d)
        node $GITHUB_WORKSPACE/packages/create-0g-app/dist/bin.js demo \
          --template storage-app --network local --no-install --no-git
        test -f demo/package.json
        test -f demo/.env.example
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: smoke test create-0g-app scaffolding"
```

---

### Task 12: Docs + changeset + README

**Files:**

- Create: `apps/docs/app/getting-started/create-0g-app/page.mdx`
- Modify: `apps/docs/app/getting-started/page.mdx`
- Modify: `README.md` (root) — promote `npm create 0g-app` to the top of Quick start
- Create: `.changeset/sp1-create-0g-app.md`

- [ ] **Step 1: Docs page**

Topics: One-line install, all flags table, the 5 templates with descriptions, what `--network local` does (links to SP2's `0g dev` page), troubleshooting (PATH issues, npm cache, behind a corporate proxy).

- [ ] **Step 2: Update root README**

Replace the existing "Quick start" snippet with:

```bash
npm create 0g-app@latest my-app
cd my-app
0g dev          # in another terminal
npm run dev
```

- [ ] **Step 3: Changeset**

```md
---
"create-0g-app": minor
"create-0gkit-app": minor
---

SP1: `npm create 0g-app@latest <name>` scaffolds a runnable 0G app in seconds.
Templates: storage-app, inference-app, attestation-verify, mcp-agent, react-app.
Pairs with SP2's `0g dev` for zero-faucet local development.
`create-0gkit-app` is a defensive alias that redirects to the canonical name.
```

- [ ] **Step 4: Commit**

```bash
git add apps/docs README.md .changeset/sp1-create-0g-app.md
git commit -m "docs(create): getting-started + README quick-start + changeset"
```

---

### Task 13: Self-review + finishing

- [ ] **Step 1: Run the full gauntlet**

```bash
pnpm install
pnpm boundary:check
pnpm typecheck
pnpm test
pnpm build
```

- [ ] **Step 2: Bench the happy path** (target ≤45s with warm cache)

```bash
time (cd /tmp && node $REPO/packages/create-0g-app/dist/bin.js demo \
  --template storage-app --network local)   # this DOES install
```

- [ ] **Step 3: Use `superpowers:finishing-a-development-branch`** to land via squash-merge once CI is green AND SP2 is also ready to ship (they release together).

---

## Spec Coverage Self-Review

| Spec requirement (SP1)                                                   | Task                                     |
| ------------------------------------------------------------------------ | ---------------------------------------- | ------ |
| `npm create 0g-app <name>` works under npm/pnpm/yarn/bun                 | Tasks 1, 3, 8                            |
| All 5 templates available via `--template`                               | Task 2                                   |
| `--network <local                                                        | galileo>`wires`.env.example` correctly   | Task 4 |
| Interactive mode prompts for name → template → network → install? → git? | Task 7                                   |
| Validates name against `../` / absolute path escape                      | Task 7 (`validateProjectName`)           |
| Final banner tells user exactly what to run next                         | Task 6                                   |
| e2e smoke runs in CI                                                     | Task 9, 11                               |
| Coverage 85%                                                             | All test tasks (vitest config in Task 1) |
| Templates fetched from pinned git ref                                    | Task 2 (`TEMPLATE_REF`)                  |
| Defensive `create-0gkit-app` registered                                  | Task 10                                  |
| Docs page + README quick-start updated                                   | Task 12                                  |
