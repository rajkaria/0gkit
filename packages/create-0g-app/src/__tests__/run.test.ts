import { describe, it, expect } from "vitest";
import {
  mkdtempSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, type RunDeps } from "../index.js";
import type { CreateOptions } from "../types.js";

/**
 * Build a default set of injected deps that capture log/err output and
 * stub the network-touching steps. Tests override what they need.
 */
function makeDeps(
  extra: Partial<RunDeps> & { cwd: string }
): RunDeps & { logs: string[]; errs: string[] } {
  const logs: string[] = [];
  const errs: string[] = [];
  const base: RunDeps = {
    log: (m) => logs.push(m),
    err: (m) => errs.push(m),
    fetchTemplate: async ({ dest }) => {
      // Write a minimal "template" so writeEnvExample has a real dir.
      writeFileSync(join(dest, "package.json"), '{"name":"x"}');
      mkdirSync(join(dest, "src"), { recursive: true });
      writeFileSync(join(dest, "src/index.ts"), "// hi\n");
    },
    runInstall: async () => {},
    initGit: async () => ({ ok: true }),
    prompts: async () => null,
  };
  return { ...base, ...extra, logs, errs };
}

const argv = (...rest: string[]) => ["node", "create-0g-app", ...rest];

describe("run() — non-interactive happy path", () => {
  it("scaffolds a complete project (template + .env.example + git + banner)", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cga-run-"));
    const deps = makeDeps({ cwd });
    const code = await run(
      argv("demo", "--template", "storage-app", "--network", "local", "--no-install"),
      deps
    );
    expect(code).toBe(0);
    expect(existsSync(join(cwd, "demo", "package.json"))).toBe(true);
    expect(existsSync(join(cwd, "demo", ".env.example"))).toBe(true);
    const env = readFileSync(join(cwd, "demo", ".env.example"), "utf8");
    expect(env).toContain("NETWORK=local");
    expect(deps.logs.join("\n")).toContain("Fetching template storage-app");
    expect(deps.logs.join("\n")).toContain("Initialising git repository");
    expect(deps.logs.join("\n")).toContain("Created demo");
  });

  it("runs the installer when --no-install is omitted", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cga-run-"));
    let installed: { pm: string; dest: string } | null = null;
    const deps = makeDeps({
      cwd,
      runInstall: async ({ packageManager, dest }) => {
        installed = { pm: packageManager, dest };
      },
    });
    const code = await run(
      argv(
        "demo",
        "--template",
        "storage-app",
        "--package-manager",
        "pnpm",
        "--no-git"
      ),
      deps
    );
    expect(code).toBe(0);
    expect(installed).not.toBeNull();
    expect(installed!.pm).toBe("pnpm");
    expect(installed!.dest).toBe(join(cwd, "demo"));
  });

  it("warns but exits 0 when install fails", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cga-run-"));
    const deps = makeDeps({
      cwd,
      runInstall: async () => {
        throw new Error("boom");
      },
    });
    const code = await run(argv("demo", "--template", "storage-app", "--no-git"), deps);
    expect(code).toBe(0);
    expect(deps.errs.join("\n")).toMatch(/install failed.*boom/);
  });

  it("warns but exits 0 when git init fails", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cga-run-"));
    const deps = makeDeps({
      cwd,
      initGit: async () => ({ ok: false, reason: "no git" }),
    });
    const code = await run(
      argv("demo", "--template", "storage-app", "--no-install"),
      deps
    );
    expect(code).toBe(0);
    expect(deps.errs.join("\n")).toMatch(/git init skipped.*no git/);
  });

  it("writes a galileo .env.example with the testnet RPC", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cga-run-"));
    const deps = makeDeps({ cwd });
    const code = await run(
      argv(
        "demo",
        "--template",
        "react-app",
        "--network",
        "galileo",
        "--no-install",
        "--no-git"
      ),
      deps
    );
    expect(code).toBe(0);
    const env = readFileSync(join(cwd, "demo", ".env.example"), "utf8");
    expect(env).toContain("NETWORK=galileo");
    expect(env).toContain("https://evmrpc-testnet.0g.ai");
  });

  it.each(["chat", "ai-agent", "tee-attested-api", "nft-with-storage"])(
    "scaffolds SP8 template: %s",
    async (template) => {
      const cwd = mkdtempSync(join(tmpdir(), "cga-run-"));
      const fetched: { name: string; dest: string }[] = [];
      const deps = makeDeps({
        cwd,
        fetchTemplate: async ({ name, dest }) => {
          fetched.push({ name, dest });
          writeFileSync(join(dest, "package.json"), `{"name":"${name}"}`);
        },
      });
      const code = await run(
        argv("demo", "--template", template, "--no-install", "--no-git"),
        deps
      );
      expect(code).toBe(0);
      expect(fetched).toEqual([{ name: template, dest: join(cwd, "demo") }]);
    }
  );
});

describe("run() — validation errors", () => {
  it("exits 1 on unknown template", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cga-run-"));
    const deps = makeDeps({ cwd });
    const code = await run(argv("demo", "--template", "nope"), deps);
    expect(code).toBe(1);
    expect(deps.errs.join("\n")).toMatch(/Unknown template/);
  });

  it("exits 1 on unknown network", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cga-run-"));
    const deps = makeDeps({ cwd });
    const code = await run(
      argv("demo", "--template", "storage-app", "--network", "mainnet"),
      deps
    );
    expect(code).toBe(1);
    expect(deps.errs.join("\n")).toMatch(/Unknown network/);
  });

  it("exits 1 on unknown package manager", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cga-run-"));
    const deps = makeDeps({ cwd });
    const code = await run(
      argv("demo", "--template", "storage-app", "--package-manager", "rustpm"),
      deps
    );
    expect(code).toBe(1);
    expect(deps.errs.join("\n")).toMatch(/Unknown package manager/);
  });

  it("exits 1 on invalid project name (slashes, in non-interactive mode)", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cga-run-"));
    const deps = makeDeps({ cwd });
    const code = await run(argv("../escape", "--template", "storage-app"), deps);
    expect(code).toBe(1);
    expect(deps.errs.join("\n")).toMatch(/Invalid name/);
  });

  it("exits 1 on invalid project name (interactive seed)", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cga-run-"));
    const deps = makeDeps({ cwd });
    const code = await run(argv("../escape"), deps);
    expect(code).toBe(1);
    expect(deps.errs.join("\n")).toMatch(/Invalid name/);
  });

  it("exits 1 when destination directory is not empty", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cga-run-"));
    mkdirSync(join(cwd, "demo"));
    writeFileSync(join(cwd, "demo", "stomp"), "x");
    const deps = makeDeps({ cwd });
    const code = await run(
      argv("demo", "--template", "storage-app", "--no-install", "--no-git"),
      deps
    );
    expect(code).toBe(1);
    expect(deps.errs.join("\n")).toMatch(/is not empty/);
  });

  it("exits 1 with the right message when template fetch fails", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cga-run-"));
    const deps = makeDeps({
      cwd,
      fetchTemplate: async () => {
        throw new Error("404");
      },
    });
    const code = await run(
      argv("demo", "--template", "storage-app", "--no-install", "--no-git"),
      deps
    );
    expect(code).toBe(1);
    expect(deps.errs.join("\n")).toMatch(/Template fetch failed.*404/);
  });
});

describe("run() — commander semantics", () => {
  it("returns 0 for --version", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cga-run-"));
    const deps = makeDeps({ cwd });
    const code = await run(argv("--version"), deps);
    expect(code).toBe(0);
  });

  it("returns 0 for --help", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cga-run-"));
    const deps = makeDeps({ cwd });
    const code = await run(argv("--help"), deps);
    expect(code).toBe(0);
  });

  it("returns non-zero on unknown option", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cga-run-"));
    const deps = makeDeps({ cwd });
    const code = await run(argv("--definitely-not-a-flag"), deps);
    expect(code).not.toBe(0);
  });
});

describe("run() — interactive path", () => {
  it("uses the prompt-supplied options when name+template aren't both flagged", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cga-run-"));
    const final: CreateOptions = {
      name: "from-prompt",
      template: "mcp-agent",
      network: "local",
      packageManager: "npm",
      install: false,
      git: false,
      ci: "none",
      dest: "",
      example: true,
    };
    const deps = makeDeps({
      cwd,
      prompts: async () => final,
    });
    const code = await run(argv(), deps);
    expect(code).toBe(0);
    expect(existsSync(join(cwd, "from-prompt", ".env.example"))).toBe(true);
  });

  it("exits 1 when prompts return null (user cancelled)", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cga-run-"));
    const deps = makeDeps({ cwd, prompts: async () => null });
    const code = await run(argv(), deps);
    expect(code).toBe(1);
  });
});

describe("run() — default dep fallbacks", () => {
  it("runs end-to-end with NO deps argument, using all default lambdas", async () => {
    // Hit the default log/err/cwd lambdas + the default fetch/install/git
    // wrappers. We can't let it actually hit the network, so we pass only
    // the side-effectful deps and let log/err/cwd default — but log/err must
    // not crash. Use a tmpdir as cwd by chdir-ing for the duration of run().
    const tmp = mkdtempSync(join(tmpdir(), "cga-defaults-"));
    const originalCwd = process.cwd();
    process.chdir(tmp);
    try {
      // Pass fetchTemplate/runInstall/initGit stubs, but let log/err/cwd
      // default. This proves the default lambdas execute without throwing.
      const code = await run(
        argv("demo-defaults", "--template", "storage-app", "--no-install", "--no-git"),
        {
          fetchTemplate: async ({ dest }) => {
            writeFileSync(join(dest, "package.json"), '{"name":"x"}');
          },
        }
      );
      expect(code).toBe(0);
      expect(existsSync(join(tmp, "demo-defaults", ".env.example"))).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("runs end-to-end including the default install + git wrappers (--no-install/--no-git omitted)", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cga-defaults-"));
    // Inject a fake template so we don't hit the network, but let
    // runInstall + initGit fall through to their defaults — runInstall
    // will fail (no real PM project), initGit will succeed. We just need
    // the wrapper functions to *execute*.
    const code = await run(
      argv("demo-defaults-2", "--template", "storage-app", "--package-manager", "bun"),
      {
        cwd,
        log: () => {},
        err: () => {},
        fetchTemplate: async ({ dest }) => {
          writeFileSync(join(dest, "package.json"), '{"name":"x","private":true}');
        },
        // runInstall + initGit intentionally omitted -> hit defaults.
        // Default runInstall will likely fail (no bun on CI) -> warn-not-fail.
      }
    );
    expect(code).toBe(0);
    expect(existsSync(join(cwd, "demo-defaults-2", ".env.example"))).toBe(true);
    // Real git was attempted; .git either exists or initGit returned ok:false
    // and emitted a warn (both code paths are fine for this assertion).
  }, 30_000);
});
