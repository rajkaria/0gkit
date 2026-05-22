import { describe, it, expect } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, type RunDeps } from "../index.js";
import type { CreateOptions } from "../types.js";

/**
 * Build the standard test deps stub. The CI tests assert what `fetchCi`
 * receives, so callers override `fetchCi` to spy or write fake files.
 */
function makeDeps(extra: Partial<RunDeps> & { cwd: string }): RunDeps {
  return {
    log: () => {},
    err: () => {},
    fetchTemplate: async ({ dest }) => {
      writeFileSync(join(dest, "package.json"), '{"name":"x"}');
      mkdirSync(join(dest, "src"), { recursive: true });
      writeFileSync(join(dest, "src/index.ts"), "// hi\n");
    },
    runInstall: async () => {},
    initGit: async () => ({ ok: true }),
    prompts: async () => null,
    ...extra,
  };
}

const argv = (...rest: string[]) => ["node", "create-0g-app", ...rest];

describe("--ci flag", () => {
  it("writes 0gkit-ci.yml when --ci github", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "ci-flag-"));
    let received: { choice: string; dest: string } | null = null;
    const deps = makeDeps({
      cwd,
      fetchCi: async ({ choice, dest }) => {
        received = { choice, dest };
        mkdirSync(join(dest, ".github/workflows"), { recursive: true });
        writeFileSync(
          join(dest, ".github/workflows/0gkit-ci.yml"),
          "name: CI\non: push\n"
        );
      },
    });
    const code = await run(
      argv(
        "demo",
        "--template",
        "storage-app",
        "--ci",
        "github",
        "--no-install",
        "--no-git"
      ),
      deps
    );
    expect(code).toBe(0);
    expect(received).not.toBeNull();
    expect(received!.choice).toBe("github");
    const path = join(cwd, "demo", ".github/workflows/0gkit-ci.yml");
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("name: CI");
  });

  it("does not call fetchCi when --ci none", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "ci-flag-"));
    let ciCalled = false;
    const deps = makeDeps({
      cwd,
      fetchCi: async () => {
        ciCalled = true;
      },
    });
    const code = await run(
      argv(
        "demo",
        "--template",
        "storage-app",
        "--ci",
        "none",
        "--no-install",
        "--no-git"
      ),
      deps
    );
    expect(code).toBe(0);
    expect(ciCalled).toBe(false);
    expect(existsSync(join(cwd, "demo", ".github"))).toBe(false);
  });

  it("defaults to github when --ci is omitted on non-interactive path", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "ci-flag-"));
    let received: { choice: string } | null = null;
    const deps = makeDeps({
      cwd,
      fetchCi: async ({ choice }) => {
        received = { choice };
      },
    });
    const code = await run(
      argv("demo", "--template", "storage-app", "--no-install", "--no-git"),
      deps
    );
    expect(code).toBe(0);
    expect(received).not.toBeNull();
    expect(received!.choice).toBe("github");
  });

  it("forwards gitlab and circle through fetchCi unchanged", async () => {
    for (const choice of ["gitlab", "circle"] as const) {
      const cwd = mkdtempSync(join(tmpdir(), "ci-flag-"));
      let received: { choice: string } | null = null;
      const deps = makeDeps({
        cwd,
        fetchCi: async ({ choice: c }) => {
          received = { choice: c };
        },
      });
      const code = await run(
        argv(
          "demo",
          "--template",
          "storage-app",
          "--ci",
          choice,
          "--no-install",
          "--no-git"
        ),
        deps
      );
      expect(code).toBe(0);
      expect(received!.choice).toBe(choice);
    }
  });

  it("rejects an unknown --ci value", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "ci-flag-"));
    const errs: string[] = [];
    const deps = makeDeps({
      cwd,
      err: (m) => errs.push(m),
    });
    const code = await run(
      argv("demo", "--template", "storage-app", "--ci", "bogus"),
      deps
    );
    expect(code).toBe(1);
    expect(errs.join("\n")).toContain("Unknown CI provider: bogus");
  });

  it("warns but proceeds when fetchCi throws", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "ci-flag-"));
    const errs: string[] = [];
    const deps = makeDeps({
      cwd,
      err: (m) => errs.push(m),
      fetchCi: async () => {
        throw new Error("network down");
      },
    });
    const code = await run(
      argv(
        "demo",
        "--template",
        "storage-app",
        "--ci",
        "github",
        "--no-install",
        "--no-git"
      ),
      deps
    );
    // CI scaffold failure is a warning, not a fatal error.
    expect(code).toBe(0);
    expect(errs.join("\n")).toContain("CI scaffold failed");
  });

  it("uses the prompt-supplied ci on the interactive path", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "ci-flag-"));
    let received: { choice: string } | null = null;
    const final: CreateOptions = {
      name: "from-prompt",
      template: "storage-app",
      network: "local",
      packageManager: "npm",
      install: false,
      git: false,
      ci: "gitlab",
      dest: "",
      example: true,
    };
    const deps = makeDeps({
      cwd,
      prompts: async () => final,
      fetchCi: async ({ choice }) => {
        received = { choice };
      },
    });
    const code = await run(argv(), deps);
    expect(code).toBe(0);
    expect(received!.choice).toBe("gitlab");
  });
});
