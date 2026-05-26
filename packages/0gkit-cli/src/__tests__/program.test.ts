import { describe, it, expect, vi } from "vitest";
import { Command } from "commander";
import { ZeroGError } from "@foundryprotocol/0gkit-core";
import { buildProgram, runCommand, type ProgramDeps } from "../program.js";

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
