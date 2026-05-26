# SP15 — Error page polish + `--copy-issue-context` CLI flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `--copy-issue-context` global CLI flag that, on a thrown `ZeroGError`, emits a redacted markdown report ready to paste into a GitHub issue. Polish the 45 error pages (remove stale "ships in SP10/SP11" stub notes now that those sprints have landed) and update the errors index page header to advertise the new flag.

**Architecture:**

- New `packages/0gkit-cli/src/issue-context.ts` — pure, side-effect-free builder. Inputs: the rendered error (code/message/hint/helpUrl), the original `argv`, a redaction config, a `now` clock, and a package-version reader. Output: a markdown string. Tested in isolation; no fs, no env, no fetch.
- `program.ts` wires a new global flag `--copy-issue-context`; `runCommand` intercepts thrown errors, builds the markdown via the new module, and writes it to stderr (so it doesn't pollute `--json` stdout). The existing `failure()` output path is unchanged.
- A `packageVersions` reader on `ProgramDeps` lets `cli.ts` resolve installed `@foundryprotocol/0gkit-*` versions at runtime via `createRequire(import.meta.url).resolve('<pkg>/package.json')`, then read each `package.json`. Tests inject a fake.
- Error page audit is a one-pass scan: remove the five "ships in SP10/SP11" notes (those packages exist on npm now); confirm zero pages carry a hardcoded `@x.y.z` pin (the SP13 `docs:check --versions` gate enforces this for the future).

**Tech Stack:** TypeScript, Vitest, Commander v14, Node.js `createRequire`, MDX (Next.js App Router).

---

## File Structure

| Path                                                                      | Responsibility                                                                                                                                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Create:** `packages/0gkit-cli/src/issue-context.ts`                     | Pure markdown builder + arg redaction.                                                                                                                                          |
| **Create:** `packages/0gkit-cli/src/__tests__/issue-context.test.ts`      | 8 unit tests for the builder + redaction.                                                                                                                                       |
| **Modify:** `packages/0gkit-cli/src/context.ts`                           | Add `copyIssueContext` to `GlobalFlags` + `CliContext`.                                                                                                                         |
| **Modify:** `packages/0gkit-cli/src/program.ts`                           | Register `--copy-issue-context` flag; extend `runCommand` to emit the markdown block on error; add `packageVersions` + `argv` + `writeErr` + `now` to `ProgramDeps`.            |
| **Modify:** `packages/0gkit-cli/src/cli.ts`                               | Wire `packageVersions` (reads installed `@foundryprotocol/0gkit-*` versions via `createRequire`); pass `process.argv.slice(2)` as `argv`; route the report to `process.stderr`. |
| **Modify:** `packages/0gkit-cli/src/__tests__/program.test.ts`            | Bump `fakeDeps()` with the new injected fields; add a `runCommand` integration test for the flag.                                                                               |
| **Modify:** `apps/docs/app/errors/page.mdx`                               | Add "Stuck? Run with `--copy-issue-context`" callout under the heading.                                                                                                         |
| **Modify:** `apps/docs/app/errors/JOBS_BACKEND_UNREACHABLE/page.mdx`      | Remove stale "Pre-SP10 stub" comment + "ships in SP10" import note.                                                                                                             |
| **Modify:** `apps/docs/app/errors/JOBS_JOB_NOT_FOUND/page.mdx`            | Remove stale "SP10" note.                                                                                                                                                       |
| **Modify:** `apps/docs/app/errors/JOBS_HANDLER_THREW/page.mdx`            | Remove stale "SP10" note.                                                                                                                                                       |
| **Modify:** `apps/docs/app/errors/JOBS_WEBHOOK_BAD_SIGNATURE/page.mdx`    | Remove stale "SP10" note.                                                                                                                                                       |
| **Modify:** `apps/docs/app/errors/OBSERVABILITY_EXPORTER_FAILED/page.mdx` | Remove stale "SP11" forward-compat note.                                                                                                                                        |
| **Modify:** `apps/docs/app/cli/page.mdx`                                  | Add "Debugging — `--copy-issue-context`" section under existing global flags.                                                                                                   |
| **Create:** `.changeset/sp15-copy-issue-context.md`                       | Minor bump on `0gkit-cli`.                                                                                                                                                      |

---

## Task 1: Pure issue-context builder + redaction (TDD)

**Files:**

- Create: `packages/0gkit-cli/src/issue-context.ts`
- Test: `packages/0gkit-cli/src/__tests__/issue-context.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/0gkit-cli/src/__tests__/issue-context.test.ts
import { describe, it, expect } from "vitest";
import { redactArgv, buildIssueContext } from "../issue-context.js";

describe("redactArgv", () => {
  it("redacts --private-key value", () => {
    expect(redactArgv(["storage", "put", "--private-key", "0xdeadbeef"])).toEqual([
      "storage",
      "put",
      "--private-key",
      "<redacted>",
    ]);
  });

  it("redacts --private-key=<value> form", () => {
    expect(redactArgv(["--private-key=0xdeadbeef", "infer"])).toEqual([
      "--private-key=<redacted>",
      "infer",
    ]);
  });

  it("redacts userinfo from --rpc URLs", () => {
    expect(
      redactArgv(["--rpc", "https://user:pass@rpc.example/v1", "chain", "balance"])
    ).toEqual(["--rpc", "https://<redacted>@rpc.example/v1", "chain", "balance"]);
  });

  it("leaves benign flags untouched", () => {
    expect(redactArgv(["chain", "balance", "0xabc", "--network", "galileo"])).toEqual([
      "chain",
      "balance",
      "0xabc",
      "--network",
      "galileo",
    ]);
  });
});

describe("buildIssueContext", () => {
  const baseInput = {
    error: {
      code: "STORAGE_QUOTA_EXCEEDED",
      message: "Storage quota exceeded.",
      hint: "Reduce upload size or split into multiple uploads.",
      helpUrl: "https://0gkit.com/errors/STORAGE_QUOTA_EXCEEDED",
      stack:
        "Error: Storage quota exceeded.\n    at Storage.upload (/x/storage.ts:42:9)\n    at Object.<anonymous> (/x/cli.ts:10:3)",
    },
    argv: ["storage", "put", "./big.bin", "--network", "galileo"],
    node: "v22.11.0",
    os: "darwin 25.5.0",
    packages: [
      { name: "@foundryprotocol/0gkit-cli", version: "1.3.0" },
      { name: "@foundryprotocol/0gkit-storage", version: "1.3.0" },
    ],
    now: new Date("2026-05-26T05:00:00.000Z"),
  };

  it("renders a complete markdown block with all sections", () => {
    const md = buildIssueContext(baseInput);
    expect(md).toContain("### 0gkit error report");
    expect(md).toContain("**Code:** `STORAGE_QUOTA_EXCEEDED`");
    expect(md).toContain("**Message:** Storage quota exceeded.");
    expect(md).toContain("**Hint:** Reduce upload size");
    expect(md).toContain("**Help:** https://0gkit.com/errors/STORAGE_QUOTA_EXCEEDED");
    expect(md).toContain("**CLI:** `0g storage put ./big.bin --network galileo`");
    expect(md).toContain("**Node:** v22.11.0");
    expect(md).toContain("**OS:** darwin 25.5.0");
    expect(md).toContain("- @foundryprotocol/0gkit-cli@1.3.0");
    expect(md).toContain("- @foundryprotocol/0gkit-storage@1.3.0");
    expect(md).toContain("at Storage.upload");
    expect(md).toContain("2026-05-26T05:00:00.000Z");
  });

  it("clips the stack to the first 10 frames", () => {
    const frames = Array.from(
      { length: 15 },
      (_, i) => `    at frame${i} (/x:${i}:1)`
    ).join("\n");
    const md = buildIssueContext({
      ...baseInput,
      error: { ...baseInput.error, stack: `Error: boom\n${frames}` },
    });
    expect(md).toContain("at frame0");
    expect(md).toContain("at frame9");
    expect(md).not.toContain("at frame10");
    expect(md).toContain("… 5 more frames omitted");
  });

  it("redacts argv before rendering the CLI line", () => {
    const md = buildIssueContext({
      ...baseInput,
      argv: ["infer", "--private-key", "0xdeadbeef", "hello"],
    });
    expect(md).toContain("**CLI:** `0g infer --private-key <redacted> hello`");
    expect(md).not.toContain("0xdeadbeef");
  });

  it("omits the stack section when no stack provided", () => {
    const md = buildIssueContext({
      ...baseInput,
      error: { ...baseInput.error, stack: undefined },
    });
    expect(md).not.toContain("#### Stack");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @foundryprotocol/0gkit-cli test issue-context`
Expected: FAIL — `Cannot find module '../issue-context.js'`.

- [ ] **Step 3: Write the minimal implementation**

````ts
// packages/0gkit-cli/src/issue-context.ts
export interface IssueContextError {
  code: string;
  message: string;
  hint: string;
  helpUrl: string;
  /** `err.stack` from the original throw. Optional — some errors lack stacks. */
  stack?: string;
}

export interface IssueContextInput {
  error: IssueContextError;
  /** argv passed to `0g` (without the bin name). Will be redacted before render. */
  argv: readonly string[];
  /** e.g. `process.version` — `v22.11.0`. */
  node: string;
  /** e.g. `darwin 25.5.0`. */
  os: string;
  /** `@foundryprotocol/0gkit-*` packages installed in the user's project. */
  packages: ReadonlyArray<{ name: string; version: string }>;
  /** Injected for deterministic snapshots in tests. */
  now: Date;
}

const SECRET_FLAGS = new Set(["--private-key", "-k"]);
const URL_FLAGS = new Set(["--rpc"]);
const MAX_STACK_FRAMES = 10;

function redactUrl(value: string): string {
  try {
    const u = new URL(value);
    if (u.username || u.password) {
      u.username = "<redacted>";
      u.password = "";
    }
    return u.toString();
  } catch {
    return value;
  }
}

/** Strip private-key values + URL userinfo from argv. Idempotent + side-effect-free. */
export function redactArgv(argv: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    // `--flag=value` form
    const eq = a.indexOf("=");
    if (a.startsWith("--") && eq > 0) {
      const flag = a.slice(0, eq);
      const value = a.slice(eq + 1);
      if (SECRET_FLAGS.has(flag)) {
        out.push(`${flag}=<redacted>`);
        continue;
      }
      if (URL_FLAGS.has(flag)) {
        out.push(`${flag}=${redactUrl(value)}`);
        continue;
      }
      out.push(a);
      continue;
    }
    // `--flag value` form
    if (SECRET_FLAGS.has(a) && i + 1 < argv.length) {
      out.push(a, "<redacted>");
      i++;
      continue;
    }
    if (URL_FLAGS.has(a) && i + 1 < argv.length) {
      out.push(a, redactUrl(argv[i + 1]));
      i++;
      continue;
    }
    out.push(a);
  }
  return out;
}

function clipStack(stack: string): { lines: string[]; omitted: number } {
  const all = stack.split("\n");
  const frameLines = all.filter((l) => l.trim().startsWith("at "));
  const header = all.filter((l) => !l.trim().startsWith("at "));
  const kept = frameLines.slice(0, MAX_STACK_FRAMES);
  const omitted = Math.max(0, frameLines.length - kept.length);
  return { lines: [...header, ...kept], omitted };
}

export function buildIssueContext(input: IssueContextInput): string {
  const cli = ["0g", ...redactArgv(input.argv)].join(" ");
  const lines: string[] = [];
  lines.push("### 0gkit error report");
  lines.push("");
  lines.push(`- **Code:** \`${input.error.code}\``);
  lines.push(`- **Message:** ${input.error.message}`);
  lines.push(`- **Hint:** ${input.error.hint}`);
  lines.push(`- **Help:** ${input.error.helpUrl}`);
  lines.push(`- **CLI:** \`${cli}\``);
  lines.push(`- **Node:** ${input.node}`);
  lines.push(`- **OS:** ${input.os}`);
  lines.push(`- **When:** ${input.now.toISOString()}`);
  lines.push("- **Packages:**");
  for (const p of input.packages) {
    lines.push(`  - ${p.name}@${p.version}`);
  }
  if (input.error.stack) {
    const { lines: stackLines, omitted } = clipStack(input.error.stack);
    lines.push("");
    lines.push("#### Stack");
    lines.push("```");
    for (const l of stackLines) lines.push(l);
    if (omitted > 0) lines.push(`… ${omitted} more frames omitted`);
    lines.push("```");
  }
  return lines.join("\n");
}
````

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @foundryprotocol/0gkit-cli test issue-context`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/0gkit-cli/src/issue-context.ts \
        packages/0gkit-cli/src/__tests__/issue-context.test.ts
git commit -m "feat(cli): add issue-context markdown builder + arg redaction"
```

---

## Task 2: Wire `--copy-issue-context` global flag into ProgramDeps + context

**Files:**

- Modify: `packages/0gkit-cli/src/context.ts`
- Modify: `packages/0gkit-cli/src/program.ts:213` (the `buildProgram` option block)
- Modify: `packages/0gkit-cli/src/program.ts:79` (the `ProgramDeps` interface)

- [ ] **Step 1: Extend `GlobalFlags` + `CliContext`**

Edit `packages/0gkit-cli/src/context.ts`:

```ts
export interface GlobalFlags {
  network?: string;
  rpc?: string;
  privateKey?: string;
  json?: boolean;
  foundry?: boolean;
  copyIssueContext?: boolean;
}

export interface CliContext {
  network: NetworkName;
  rpcUrl?: string;
  privateKey?: string;
  json: boolean;
  foundry: boolean;
  copyIssueContext: boolean;
}
```

And in `resolveContext` add:

```ts
return {
  network: raw as NetworkName,
  rpcUrl: flags.rpc ?? env.ZEROG_RPC_URL,
  privateKey: flags.privateKey ?? env.ZEROG_PRIVATE_KEY,
  json: flags.json === true,
  foundry: flags.foundry === true,
  copyIssueContext: flags.copyIssueContext === true,
};
```

- [ ] **Step 2: Extend `ProgramDeps` in `program.ts`**

Edit `packages/0gkit-cli/src/program.ts`. After the existing fields, before the closing `}` of `ProgramDeps`:

```ts
  /** Original argv (without bin name) used to render the issue-context CLI line. */
  argv: readonly string[];
  /** Side-channel for the issue-context report. Goes to stderr in production
   *  so it never pollutes `--json` stdout. Tests inject a recorder. */
  writeErr: (line: string) => void;
  /** Resolves installed `@foundryprotocol/0gkit-*` versions for issue-context. */
  packageVersions: () => Array<{ name: string; version: string }>;
  /** Injected for deterministic timestamps in issue-context. */
  now: () => Date;
```

- [ ] **Step 3: Register the `--copy-issue-context` option**

In `buildProgram`, add a fifth `.option(...)` line right before `.exitOverride()`:

```ts
    .option("--foundry", "force-show the optional Foundry plugin namespace")
    .option(
      "--copy-issue-context",
      "on error, print a redacted markdown report to stderr — paste into a new GitHub issue"
    )
    .exitOverride();
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm --filter @foundryprotocol/0gkit-cli typecheck`
Expected: PASS — the new fields type-check.

(Tests will fail until `cli.ts` supplies them — that's Task 3.)

- [ ] **Step 5: Commit**

```bash
git add packages/0gkit-cli/src/context.ts packages/0gkit-cli/src/program.ts
git commit -m "feat(cli): plumb --copy-issue-context flag through context + ProgramDeps"
```

---

## Task 3: Emit the markdown report from `runCommand`

**Files:**

- Modify: `packages/0gkit-cli/src/program.ts:183-211` (the `runCommand` function)

- [ ] **Step 1: Write the failing test**

Append to `packages/0gkit-cli/src/__tests__/program.test.ts`:

```ts
import { runCommand } from "../program.js";
import { Command } from "commander";

describe("runCommand --copy-issue-context", () => {
  it("emits a redacted markdown block to stderr on ZeroGError when flag set", async () => {
    const errLines: string[] = [];
    const deps = fakeDeps({
      writeErr: (s: string) => errLines.push(s),
      argv: ["storage", "put", "./x.bin", "--private-key", "0xdeadbeef"],
      packageVersions: () => [{ name: "@foundryprotocol/0gkit-cli", version: "1.3.0" }],
      now: () => new Date("2026-05-26T05:00:00.000Z"),
    });
    const cmd = new Command();
    cmd.option("--copy-issue-context", "");
    cmd.parse(["node", "test", "--copy-issue-context"], { from: "user" });

    await runCommand(deps, cmd, async () => {
      const { ZeroGError } = await import("@foundryprotocol/0gkit-core");
      throw new ZeroGError({
        code: "STORAGE_QUOTA_EXCEEDED",
        message: "Storage quota exceeded.",
        hint: "Reduce upload size.",
      });
    });

    const blob = errLines.join("\n");
    expect(blob).toContain("### 0gkit error report");
    expect(blob).toContain("STORAGE_QUOTA_EXCEEDED");
    expect(blob).toContain("--private-key <redacted>");
    expect(blob).not.toContain("0xdeadbeef");
  });

  it("does NOT emit the report when --copy-issue-context is absent", async () => {
    const errLines: string[] = [];
    const deps = fakeDeps({
      writeErr: (s: string) => errLines.push(s),
      argv: ["storage", "put", "./x.bin"],
    });
    const cmd = new Command();
    cmd.option("--copy-issue-context", "");
    cmd.parse(["node", "test"], { from: "user" });

    await runCommand(deps, cmd, async () => {
      const { ZeroGError } = await import("@foundryprotocol/0gkit-core");
      throw new ZeroGError({
        code: "STORAGE_QUOTA_EXCEEDED",
        message: "Boom.",
        hint: "Fix it.",
      });
    });

    expect(errLines.join("\n")).toBe("");
  });
});
```

Bump `fakeDeps()` in the same file to default the new fields so existing tests keep passing:

```ts
function fakeDeps(over: Partial<ProgramDeps> = {}): ProgramDeps {
  const lines: string[] = [];
  const errLines: string[] = [];
  return {
    // ... existing fields unchanged ...
    argv: [],
    writeErr: (s: string) => errLines.push(s),
    packageVersions: () => [],
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    write: (s: string) => lines.push(s),
    _lines: lines,
    _errLines: errLines,
    ...over,
  } as unknown as ProgramDeps;
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @foundryprotocol/0gkit-cli test program`
Expected: FAIL — the new describe block fails because `runCommand` doesn't emit to `writeErr` yet.

- [ ] **Step 3: Modify `runCommand` to emit the report**

Edit `packages/0gkit-cli/src/program.ts`. Replace the existing `runCommand` body:

```ts
export async function runCommand(
  deps: ProgramDeps,
  cmd: Command,
  body: (ctx: CliContext) => Promise<CommandResult>
): Promise<void> {
  const { context, out } = ctxOf(deps, cmd);
  try {
    out.success(await body(context));
  } catch (err) {
    let rendered: { code: string; message: string; hint: string; helpUrl: string };
    let stack: string | undefined;
    if (err instanceof ZeroGError) {
      rendered = {
        code: err.code,
        message: err.message,
        hint: err.hint,
        helpUrl: err.helpUrl,
      };
      stack = err.stack;
    } else {
      const e = err as {
        code?: string;
        message?: string;
        hint?: string;
        stack?: string;
      };
      const fallbackCode = "CONFIG_INVALID_ARGUMENT";
      rendered = {
        code: e.code ?? fallbackCode,
        message: e.message ?? String(err),
        hint: e.hint ?? "Unexpected error — re-run with --json for the raw shape.",
        helpUrl: helpUrlFor((e.code as never) ?? fallbackCode),
      };
      stack = e.stack;
    }
    out.failure(rendered);
    if (context.copyIssueContext) {
      const { buildIssueContext } = await import("./issue-context.js");
      const md = buildIssueContext({
        error: { ...rendered, stack },
        argv: deps.argv,
        node: process.version,
        os: `${process.platform} ${(await import("node:os")).release()}`,
        packages: deps.packageVersions(),
        now: deps.now(),
      });
      deps.writeErr(md);
    }
    process.exitCode = 1;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @foundryprotocol/0gkit-cli test program`
Expected: PASS — both new `runCommand --copy-issue-context` tests green; existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/0gkit-cli/src/program.ts packages/0gkit-cli/src/__tests__/program.test.ts
git commit -m "feat(cli): emit issue-context markdown to stderr on ZeroGError"
```

---

## Task 4: Wire the production `cli.ts` (real packageVersions + argv + writeErr)

**Files:**

- Modify: `packages/0gkit-cli/src/cli.ts:88-211`

- [ ] **Step 1: Add the package-versions reader**

Edit `packages/0gkit-cli/src/cli.ts`. Right above the `readStdin` function add:

```ts
import { createRequire } from "node:module";

const KNOWN_0GKIT_PACKAGES = [
  "@foundryprotocol/0gkit-cli",
  "@foundryprotocol/0gkit-core",
  "@foundryprotocol/0gkit-chain",
  "@foundryprotocol/0gkit-storage",
  "@foundryprotocol/0gkit-compute",
  "@foundryprotocol/0gkit-da",
  "@foundryprotocol/0gkit-attestation",
  "@foundryprotocol/0gkit-contracts",
  "@foundryprotocol/0gkit-devnet",
  "@foundryprotocol/0gkit-observability",
] as const;

function readPackageVersions(): Array<{ name: string; version: string }> {
  const req = createRequire(import.meta.url);
  const out: Array<{ name: string; version: string }> = [];
  for (const name of KNOWN_0GKIT_PACKAGES) {
    try {
      const pkgPath = req.resolve(`${name}/package.json`);
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
      if (pkg.version) out.push({ name, version: pkg.version });
    } catch {
      // Package not installed; skip.
    }
  }
  return out;
}
```

(`readFileSync` is already imported indirectly via `program.ts`; add an explicit `import { readFileSync } from "node:fs";` at the top of `cli.ts`.)

- [ ] **Step 2: Plumb the new fields into the `deps` object**

In the `deps: ProgramDeps = {...}` literal, after `write: (line) => process.stdout.write(line + "\n"),` append:

```ts
  argv: process.argv.slice(2),
  writeErr: (line) => process.stderr.write(line + "\n"),
  packageVersions: readPackageVersions,
  now: () => new Date(),
```

- [ ] **Step 3: Build the CLI**

Run: `pnpm --filter @foundryprotocol/0gkit-cli build`
Expected: PASS — build succeeds; the new imports and fields type-check.

- [ ] **Step 4: Smoke-test from the built dist (live)**

Run from the workspace root:

```bash
node packages/0gkit-cli/dist/cli.js \
  --copy-issue-context \
  chain balance 0x0000000000000000000000000000000000000000 \
  --network galileo \
  2>&1 1>/dev/null \
  | head -20
```

Expected: stderr contains `### 0gkit error report` block (galileo RPC will error on the all-zeroes address, triggering the report). Stdout is empty.

- [ ] **Step 5: Commit**

```bash
git add packages/0gkit-cli/src/cli.ts
git commit -m "feat(cli): wire packageVersions/argv/writeErr/now for --copy-issue-context"
```

---

## Task 5: Update errors index page header (advertise the new flag)

**Files:**

- Modify: `apps/docs/app/errors/page.mdx:1-12`

- [ ] **Step 1: Replace the intro paragraph**

After the first paragraph (ends with "Click a code for cause, fix, and a minimal example."), add a blockquote:

```mdx
> **Stuck?** Re-run any `0g` command with `--copy-issue-context`. On a thrown error, the CLI prints a redacted markdown report — error code, hint, redacted CLI args, Node + OS versions, installed package versions, and the top of the stack — ready to paste into a [new issue](https://github.com/rajkaria/0gkit/issues/new).
```

- [ ] **Step 2: Verify the docs build**

Run: `pnpm --filter docs build`
Expected: PASS — MDX compiles, no broken links.

- [ ] **Step 3: Commit**

```bash
git add apps/docs/app/errors/page.mdx
git commit -m "docs(errors): advertise --copy-issue-context in index page header"
```

---

## Task 6: Document the flag in the CLI reference

**Files:**

- Modify: `apps/docs/app/cli/page.mdx`

- [ ] **Step 1: Add a "Debugging" section**

Find the "Global flags" section in `apps/docs/app/cli/page.mdx` (search for `--network` or `--json`). Add a new subsection after it:

````mdx
## Debugging: `--copy-issue-context`

Any `0g` command supports `--copy-issue-context`. When the command throws a `ZeroGError`, the normal error output goes to stdout as usual; in addition, a markdown report is written to **stderr** suitable for pasting into a new GitHub issue.

The report contains:

- Error `code`, `message`, `hint`, and `helpUrl`.
- The CLI invocation, with `--private-key` redacted and URL userinfo stripped from `--rpc`.
- Node.js version, OS, and the timestamp.
- Versions of all installed `@foundryprotocol/0gkit-*` packages.
- The top 10 frames of the stack.

```bash
0g storage put ./big.bin --copy-issue-context
# ... error message on stdout ...
# ... markdown report on stderr ...
```
````

To capture only the report:

```bash
0g storage put ./big.bin --copy-issue-context 2> issue.md
```

````

- [ ] **Step 2: Verify the docs build**

Run: `pnpm --filter docs build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/docs/app/cli/page.mdx
git commit -m "docs(cli): document --copy-issue-context global flag"
```

---

## Task 7: Strip stale "ships in SP10/SP11" notes from 5 error pages

**Files:**

- Modify: `apps/docs/app/errors/JOBS_BACKEND_UNREACHABLE/page.mdx`
- Modify: `apps/docs/app/errors/JOBS_JOB_NOT_FOUND/page.mdx`
- Modify: `apps/docs/app/errors/JOBS_HANDLER_THREW/page.mdx`
- Modify: `apps/docs/app/errors/JOBS_WEBHOOK_BAD_SIGNATURE/page.mdx`
- Modify: `apps/docs/app/errors/OBSERVABILITY_EXPORTER_FAILED/page.mdx`

- [ ] **Step 1: Edit JOBS_BACKEND_UNREACHABLE**

Replace the `## Example` block contents (which currently reads `// Pre-SP10 stub — surface for forward-compat` + `import { JobRunner } from "@foundryprotocol/0gkit-jobs"; // ships in SP10`) with a real working snippet:

```mdx
## Example

```ts
import { JobRunner } from "@foundryprotocol/0gkit-jobs";
import { SqliteBackend } from "@foundryprotocol/0gkit-jobs/backends/sqlite";

const runner = new JobRunner({ backend: new SqliteBackend({ path: ".jobs.db" }) });
await runner.start();
// If the sqlite file is on an unwritable disk this throws JOBS_BACKEND_UNREACHABLE.
```
```

- [ ] **Step 2: Edit JOBS_JOB_NOT_FOUND**

Replace the same kind of stub with:

```mdx
## Example

```ts
import { JobRunner } from "@foundryprotocol/0gkit-jobs";

const status = await runner.status("00000000-deadbeef");
// Throws JOBS_JOB_NOT_FOUND — no row in the backend with that id.
```
```

- [ ] **Step 3: Edit JOBS_HANDLER_THREW**

```mdx
## Example

```ts
import { jobs } from "@foundryprotocol/0gkit-jobs";

const broken = jobs.define({
  name: "broken",
  input: z.object({}),
  output: z.object({}),
  handler: async () => {
    throw new Error("boom");
  },
});
// After maxAttempts exhausted, runner records JOBS_HANDLER_THREW on the row.
```
```

- [ ] **Step 4: Edit JOBS_WEBHOOK_BAD_SIGNATURE**

```mdx
## Example

```ts
import { verifyWebhook } from "@foundryprotocol/0gkit-jobs";

const ok = verifyWebhook(rawBody, headerSig, secret);
if (!ok) throw new Error("JOBS_WEBHOOK_BAD_SIGNATURE");
```
```

- [ ] **Step 5: Edit OBSERVABILITY_EXPORTER_FAILED**

Replace the forward-compat note with:

```mdx
## Example

```ts
import { instrument0g } from "@foundryprotocol/0gkit-observability";

await instrument0g({
  serviceName: "my-app",
  exporter: { kind: "otlp", endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT! },
});
// If the OTLP endpoint is unreachable on first flush, the SDK throws OBSERVABILITY_EXPORTER_FAILED.
```
```

- [ ] **Step 6: Run the docs-check + version gate**

Run from workspace root:

```bash
pnpm docs:check
pnpm docs:check --versions
```

Expected: both PASS — all error codes still have pages, no version drift.

- [ ] **Step 7: Commit**

```bash
git add apps/docs/app/errors/JOBS_BACKEND_UNREACHABLE/page.mdx \
        apps/docs/app/errors/JOBS_JOB_NOT_FOUND/page.mdx \
        apps/docs/app/errors/JOBS_HANDLER_THREW/page.mdx \
        apps/docs/app/errors/JOBS_WEBHOOK_BAD_SIGNATURE/page.mdx \
        apps/docs/app/errors/OBSERVABILITY_EXPORTER_FAILED/page.mdx
git commit -m "docs(errors): remove stale SP10/SP11 stub notes — packages have shipped"
```

---

## Task 8: Changeset + full-workspace verification

**Files:**

- Create: `.changeset/sp15-copy-issue-context.md`

- [ ] **Step 1: Write the changeset**

```markdown
---
"@foundryprotocol/0gkit-cli": minor
---

Add `--copy-issue-context` global flag. On any thrown `ZeroGError`, the CLI now optionally prints a redacted markdown report to stderr — error code, hint, help URL, redacted CLI invocation, Node + OS versions, installed `@foundryprotocol/0gkit-*` versions, and the top 10 stack frames. Designed to paste straight into a new GitHub issue.
```

- [ ] **Step 2: Run the workspace-wide gates**

```bash
pnpm format:check
pnpm boundary:check
pnpm typecheck
pnpm test
pnpm docs:check
pnpm docs:check --versions
pnpm templates:check
```

Expected: every gate green.

- [ ] **Step 3: Commit + push + open PR + merge**

```bash
git add .changeset/sp15-copy-issue-context.md
git commit -m "chore: changeset for SP15 (cli minor: --copy-issue-context)"
git push -u origin sp15-error-polish-copy-issue-context
gh pr create --title "SP15: --copy-issue-context CLI flag + error page polish" --body "$(cat <<'EOF'
## Summary

- New global flag `--copy-issue-context` on every `0g` command. On any thrown `ZeroGError`, prints a redacted markdown block to **stderr** (so `--json` stdout stays clean) ready to paste into a new GitHub issue.
- Report contents: code, message, hint, helpUrl, redacted CLI invocation, Node + OS versions, all installed `@foundryprotocol/0gkit-*` versions, and the top 10 stack frames.
- Redactions: `--private-key` value scrubbed (both `--flag value` and `--flag=value` forms); URL userinfo stripped from `--rpc`.
- Index page (`/errors`) gains a "Stuck? Run with `--copy-issue-context`" callout.
- CLI reference (`/cli`) gains a Debugging section documenting the flag.
- Removed stale "ships in SP10/SP11" stub notes from five error pages (those packages have shipped + are on npm).

## Test plan

- [x] 8 new unit tests for `redactArgv` + `buildIssueContext` (pure markdown builder).
- [x] 2 new integration tests for `runCommand --copy-issue-context` (positive + negative case).
- [x] `pnpm docs:check`, `pnpm docs:check --versions`, `pnpm typecheck`, `pnpm test`, `pnpm boundary:check` all green workspace-wide.
- [x] Live smoke against `node dist/cli.js --copy-issue-context chain balance 0x0... --network galileo` confirms the report appears on stderr with no stdout pollution.
EOF
)"
```

Wait for CI green, then squash-merge:

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 4: Merge the auto-generated version-packages PR**

After the SP15 PR lands, the changesets bot opens a "chore: version packages" PR. Merge it once CI is green so the release workflow publishes `@foundryprotocol/0gkit-cli@1.4.0` to npm.

---

## Self-Review

**1. Spec coverage:**

- ✅ `--copy-issue-context` CLI flag — Task 2 (plumb) + Task 3 (emit) + Task 4 (production wiring).
- ✅ Markdown block contents (code/message/hint/CLI args redacted/Node+OS/package versions/top 10 stack frames/docs link) — Task 1.
- ✅ Errors index page header callout — Task 5.
- ✅ Audit pass for stale package versions / dead repro commands — Task 6 (docs `--versions` gate already enforces version pins; explicit run confirms zero drift) + Task 7 (the only dead repro commands found in a one-pass scan were the five "ships in SP10/SP11" stub notes).
- ✅ Changeset + release — Task 8.

**2. Placeholder scan:** No TBDs, no "add validation," no "similar to Task N." Every step has the actual code/command an engineer needs.

**3. Type consistency:** `GlobalFlags.copyIssueContext` matches the commander option name (`--copy-issue-context` → camelCased to `copyIssueContext`). `CliContext.copyIssueContext` is `boolean` (not optional). `ProgramDeps.argv` is `readonly string[]`; `IssueContextInput.argv` is `readonly string[]` — they line up. `packageVersions: () => Array<{ name: string; version: string }>` matches `IssueContextInput.packages: ReadonlyArray<{ name: string; version: string }>` (function returns mutable, input accepts readonly — fine).

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-26-sp15-error-polish-copy-issue-context.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.
````
