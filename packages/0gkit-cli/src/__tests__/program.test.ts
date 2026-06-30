import { describe, it, expect, vi } from "vitest";
import { Command } from "commander";
import { ZeroGError, getNetwork } from "@foundryprotocol/0gkit-core";
import { buildProgram, runCommand, type ProgramDeps } from "../program.js";
import type { KitsEngineLike } from "../commands/kits.js";

// ---------------------------------------------------------------------------
// Fake kits engine (injected so no real dynamic import / network occurs)
// ---------------------------------------------------------------------------

function fakeKitsEngine(over: Partial<KitsEngineLike> = {}): KitsEngineLike {
  const applyKit = vi.fn(async () => ({
    applied: ["agent-memory"],
    filesWritten: ["lib/agent-memory.ts"],
    envAdded: ["OG_STORAGE_NAMESPACE"],
    notes: ["Run pnpm install to add dependencies."],
    token: "[0gkit:kit-applied]" as const,
  }));
  const listKits = vi.fn(() => [
    {
      name: "agent-memory",
      title: "Agent Memory",
      domain: "agent-infra" as const,
      summary: "Persistent agent memory on 0G Storage.",
      compatibleBases: ["react-app", "mcp-agent"],
      tiers: { lib: ["lib/agent-memory.ts"], adapters: {}, ui: [] },
      env: [{ key: "OG_STORAGE_NAMESPACE", example: "agent-memory" }],
      dependencies: {},
      devDependencies: {},
      requires: [],
      composes: [],
      conflicts: [],
    },
  ]);
  const getKit = vi.fn((name: string) =>
    name === "agent-memory"
      ? {
          name: "agent-memory",
          title: "Agent Memory",
          domain: "agent-infra" as const,
          summary: "Persistent agent memory on 0G Storage.",
          compatibleBases: ["react-app", "mcp-agent"],
          tiers: { lib: ["lib/agent-memory.ts"] },
          env: [{ key: "OG_STORAGE_NAMESPACE", example: "agent-memory" }],
          dependencies: {},
          devDependencies: {},
          requires: [],
          composes: [],
          conflicts: [],
        }
      : undefined
  );
  const detectBase = vi.fn(() => "node");
  return { applyKit, listKits, getKit, detectBase, ...over };
}

function fakeDeps(over: Partial<ProgramDeps> = {}): ProgramDeps {
  const lines: string[] = [];
  const errLines: string[] = [];
  return {
    createClient: vi.fn(),
    getNetwork: vi.fn(),
    faucet: vi.fn(),
    balance: vi.fn(),
    waitForReceipt: vi.fn(),
    attachExplorerUrl: vi.fn((r) => r),
    explorerUrl: vi.fn(() => "https://x/tx/0x"),
    makeStorage: vi.fn(),
    makeCompute: vi.fn(),
    makeDA: vi.fn(),
    attest: {
      parseEnvelope: vi.fn(),
      verifyEnvelope: vi.fn(),
      reportEnvelope: vi.fn(),
    },
    devnet: {
      startDevnet: vi.fn(),
      stopDevnet: vi.fn(),
      isRunning: vi.fn(async () => false),
      readState: vi.fn(() => null),
      clearState: vi.fn(),
    },
    loadFoundry: vi.fn(async () => null),
    fs: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      readdir: vi.fn(async () => []),
      exists: vi.fn(async () => false),
    },
    readStdin: vi.fn(async () => new Uint8Array()),
    fetch: vi.fn(async () => ({ status: 200 })),
    cwd: () => "/tmp",
    env: {},
    isTTY: false,
    noColor: true,
    write: (s: string) => lines.push(s),
    argv: [],
    writeErr: (s: string) => errLines.push(s),
    packageVersions: () => [],
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    loadKitsEngine: async () => fakeKitsEngine(),
    _lines: lines,
    _errLines: errLines,
    ...over,
  } as unknown as ProgramDeps;
}

describe("buildProgram", () => {
  it("registers the neutral command groups", async () => {
    const program = buildProgram(fakeDeps());
    const names = program.commands.map((c) => c.name()).sort();
    expect(names).toEqual(
      [
        "add",
        "attest",
        "chain",
        "contracts",
        "cost",
        "da",
        "dev",
        "doctor",
        "estimate",
        "infer",
        "init",
        "jobs",
        "kits",
        "storage",
        "traces",
      ].sort()
    );
  });

  it("hides `foundry` from help when the plugin is absent", async () => {
    const program = buildProgram(fakeDeps());
    program.exitOverride();
    program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
    expect(program.commands.find((c) => c.name() === "foundry")).toBeUndefined();
  });

  it("shows `foundry` only when --foundry is present in argv", () => {
    const orig = process.argv;
    process.argv = [...orig, "--foundry"];
    try {
      const program = buildProgram(fakeDeps());
      expect(program.commands.find((c) => c.name() === "foundry")).toBeDefined();
    } finally {
      process.argv = orig;
    }
  });

  it("exposes --network/--rpc/--json/--private-key global options", () => {
    const program = buildProgram(fakeDeps());
    const opts = program.options.map((o) => o.long);
    expect(opts).toEqual(
      expect.arrayContaining(["--json", "--network", "--private-key", "--rpc"])
    );
  });

  it("renders a thrown ZeroGError through the json renderer", async () => {
    const deps = fakeDeps();
    deps.createClient = vi.fn(() => {
      throw Object.assign(new Error("rpc dead"), {
        code: "CHAIN_RPC_UNREACHABLE",
        hint: "run 0g doctor",
      });
    });
    const program = buildProgram(deps);
    program.exitOverride();
    await program.parseAsync(
      ["chain", "balance", "0x1111111111111111111111111111111111111111", "--json"],
      { from: "user" }
    );
    const payload = JSON.parse((deps as any)._lines.at(-1));
    expect(payload).toEqual({
      ok: false,
      error: {
        code: "CHAIN_RPC_UNREACHABLE",
        message: "rpc dead",
        hint: "run 0g doctor",
        helpUrl: "https://0gkit.com/errors/CHAIN_RPC_UNREACHABLE",
      },
    });
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });
});

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
    cmd.parse(["--copy-issue-context"], { from: "user" });

    await runCommand(deps, cmd, async () => {
      throw new ZeroGError(
        "STORAGE_QUOTA_EXCEEDED",
        "Storage quota exceeded.",
        "Reduce upload size."
      );
    });

    const blob = errLines.join("\n");
    expect(blob).toContain("### 0gkit error report");
    expect(blob).toContain("STORAGE_QUOTA_EXCEEDED");
    expect(blob).toContain("--private-key <redacted>");
    expect(blob).not.toContain("0xdeadbeef");
    process.exitCode = 0;
  });

  it("does NOT emit the report when --copy-issue-context is absent", async () => {
    const errLines: string[] = [];
    const deps = fakeDeps({
      writeErr: (s: string) => errLines.push(s),
      argv: ["storage", "put", "./x.bin"],
    });
    const cmd = new Command();
    cmd.option("--copy-issue-context", "");
    cmd.parse([], { from: "user" });

    await runCommand(deps, cmd, async () => {
      throw new ZeroGError("STORAGE_QUOTA_EXCEEDED", "Boom.", "Fix it.");
    });

    expect(errLines.join("\n")).toBe("");
    process.exitCode = 0;
  });
});

describe("runCommand --defect-report", () => {
  it("emits a QA defect report to stderr with auto-routing + suggested severity", async () => {
    const errLines: string[] = [];
    const deps = fakeDeps({
      writeErr: (s: string) => errLines.push(s),
      getNetwork,
    });
    const cmd = new Command();
    cmd.option("--defect-report", "");
    cmd.option("--network <name>", "");
    cmd.parse(["--defect-report", "--network", "galileo"], { from: "user" });

    await runCommand(deps, cmd, async () => {
      throw new ZeroGError(
        "CHAIN_RPC_UNREACHABLE",
        "RPC unreachable.",
        "Check the network."
      );
    });

    const blob = errLines.join("\n");
    expect(blob).toContain("### 0gkit defect report");
    expect(blob).toContain("归属（Ownership）：0G Infra");
    expect(blob).toContain("严重度（Severity）：P1");
    expect(blob).toContain("Chain ID 16602");
    expect(blob).toContain("网络/Network galileo");
    expect(blob).toContain("CHAIN_RPC_UNREACHABLE");
    process.exitCode = 0;
  });

  it("does NOT emit the defect report when the flag is absent", async () => {
    const errLines: string[] = [];
    const deps = fakeDeps({ writeErr: (s: string) => errLines.push(s) });
    const cmd = new Command();
    cmd.option("--defect-report", "");
    cmd.parse([], { from: "user" });

    await runCommand(deps, cmd, async () => {
      throw new ZeroGError("STORAGE_QUOTA_EXCEEDED", "Boom.", "Fix it.");
    });

    expect(errLines.join("\n")).toBe("");
    process.exitCode = 0;
  });
});

// ---------------------------------------------------------------------------
// 0g kits / 0g add
// ---------------------------------------------------------------------------

describe("0g kits list", () => {
  it("prints kits compatible with the detected base", async () => {
    const engine = fakeKitsEngine({
      detectBase: vi.fn(() => "mcp-agent"),
      listKits: vi.fn(() => [
        {
          name: "agent-memory",
          title: "Agent Memory",
          domain: "agent-infra" as const,
          summary: "Persistent agent memory on 0G Storage.",
          compatibleBases: ["mcp-agent"],
          tiers: { lib: ["lib/agent-memory.ts"], adapters: {}, ui: [] },
          env: [],
          dependencies: {},
          devDependencies: {},
          requires: [],
          composes: [],
          conflicts: [],
        },
      ]),
    });
    const deps = fakeDeps({
      loadKitsEngine: async () => engine,
      cwd: () => "/fake/project",
    });

    const program = buildProgram(deps);
    program.exitOverride();
    await program.parseAsync(["kits", "list"], { from: "user" });

    const output = (deps as any)._lines.join("\n");
    expect(output).toContain("agent-memory");
    expect(output).toContain("Agent Memory");
    // detectBase was called with the cwd
    expect(engine.detectBase).toHaveBeenCalledWith("/fake/project");
    // listKits was called with the detected base
    expect(engine.listKits).toHaveBeenCalledWith(
      expect.objectContaining({ base: "mcp-agent" })
    );
  });

  it("respects --base override and skips detectBase", async () => {
    const engine = fakeKitsEngine();
    const deps = fakeDeps({ loadKitsEngine: async () => engine });

    const program = buildProgram(deps);
    program.exitOverride();
    await program.parseAsync(["kits", "list", "--base", "react-app"], { from: "user" });

    expect(engine.listKits).toHaveBeenCalledWith(
      expect.objectContaining({ base: "react-app" })
    );
    expect(engine.detectBase).not.toHaveBeenCalled();
  });
});

describe("0g add", () => {
  it("calls applyKit with kit name and cwd as dest, then prints token", async () => {
    const applyKit = vi.fn(async () => ({
      applied: ["agent-memory"],
      filesWritten: ["lib/agent-memory.ts"],
      envAdded: [],
      notes: ["Run pnpm install."],
      token: "[0gkit:kit-applied]" as const,
    }));
    const engine = fakeKitsEngine({ applyKit, detectBase: vi.fn(() => "node") });
    const deps = fakeDeps({
      loadKitsEngine: async () => engine,
      cwd: () => "/my/project",
    });

    const program = buildProgram(deps);
    program.exitOverride();
    await program.parseAsync(["add", "agent-memory"], { from: "user" });

    expect(applyKit).toHaveBeenCalledWith(
      expect.objectContaining({
        kit: "agent-memory",
        dest: "/my/project",
        base: "node",
      })
    );

    const output = (deps as any)._lines.join("\n");
    expect(output).toContain("[0gkit:kit-applied]");
  });

  it("maps a KitError to failure output and sets exitCode 1", async () => {
    const engine = fakeKitsEngine({
      applyKit: vi.fn(async () => {
        const err = new Error('Kit "ghost" not found in registry.') as Error & {
          code: string;
        };
        err.name = "KitError";
        err.code = "KIT_NOT_FOUND";
        throw err;
      }),
      detectBase: vi.fn(() => "node"),
    });
    const deps = fakeDeps({ loadKitsEngine: async () => engine });

    const program = buildProgram(deps);
    program.exitOverride();
    await program.parseAsync(["add", "ghost", "--json"], { from: "user" });

    const payload = JSON.parse((deps as any)._lines.at(-1));
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe("KIT_NOT_FOUND");
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });
});

describe("0g kits info", () => {
  it("prints summary, tiers, and env vars for a known kit", async () => {
    const engine = fakeKitsEngine();
    const deps = fakeDeps({ loadKitsEngine: async () => engine });

    const program = buildProgram(deps);
    program.exitOverride();
    await program.parseAsync(["kits", "info", "agent-memory"], { from: "user" });

    const output = (deps as any)._lines.join("\n");
    expect(output).toContain("Agent Memory");
    expect(output).toContain("Persistent agent memory");
    expect(output).toContain("OG_STORAGE_NAMESPACE");
  });

  it("exits 1 for an unknown kit", async () => {
    const engine = fakeKitsEngine({ getKit: vi.fn(() => undefined) });
    const deps = fakeDeps({ loadKitsEngine: async () => engine });

    const program = buildProgram(deps);
    program.exitOverride();
    await program.parseAsync(["kits", "info", "ghost-kit", "--json"], { from: "user" });

    const payload = JSON.parse((deps as any)._lines.at(-1));
    expect(payload.ok).toBe(false);
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });
});
