/**
 * Tests for `0g test` conformance runner (T3) + `--kits` synergy (T5b).
 *
 * Key invariants:
 * - `runConformance` is injected via `ProgramDeps.runConformance` so tests
 *   never actually import `@foundryprotocol/0gkit-testing`.
 * - `conformanceDeps` and `runKitConformance` are also injected so no live
 *   network or filesystem access occurs during tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildProgram, type ProgramDeps } from "../program.js";
import type { SuiteResult } from "@foundryprotocol/0gkit-testing";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(over: Partial<ProgramDeps> = {}): {
  d: ProgramDeps;
  lines: string[];
  errLines: string[];
} {
  const lines: string[] = [];
  const errLines: string[] = [];

  const allPassResults: SuiteResult[] = [
    { name: "storage", ok: true, detail: "upload→download ok" },
    { name: "compute", ok: true, detail: "inference ok" },
    { name: "da", ok: true, detail: "publish→verify ok" },
    { name: "wallet", ok: true, detail: "sign→recover ok" },
  ];

  const base: ProgramDeps = {
    createClient: vi.fn(() => ({
      public: { getChainId: vi.fn(async () => 16602) },
    })),
    getNetwork: vi.fn(() => ({
      name: "galileo",
      chainId: 16602,
      rpcUrl: "https://rpc",
      testnet: true,
    })),
    faucet: vi.fn(),
    balance: vi.fn(async () => 0n),
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
    contracts: {
      generate: vi.fn(),
      listStandard: vi.fn(() => []),
      getStandard: vi.fn(() => null),
      estimate: vi.fn(),
    },
    jobsBackendFactory: vi.fn(),
    storageEstimate: vi.fn(),
    computeEstimate: vi.fn(),
    daEstimate: vi.fn(),
    tracesReader: {
      defaultTraceDir: vi.fn(() => null),
      listTraceFiles: vi.fn(async () => []),
      readTraceFile: vi.fn(async () => []),
      summarizeTrace: vi.fn(() => ({ id: "", spans: [] })),
    },
    fs: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      readdir: vi.fn(async () => []),
      exists: vi.fn(async () => false),
    },
    readStdin: vi.fn(async () => new Uint8Array()),
    fetch: vi.fn(async () => ({ status: 200 })),
    cwd: () => "/tmp/test-proj",
    homedir: () => "/home/test",
    env: {},
    isTTY: false,
    noColor: true,
    write: (s: string) => lines.push(s),
    argv: [],
    writeErr: (s: string) => errLines.push(s),
    packageVersions: () => [],
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    loadKitsEngine: vi.fn(async () => ({
      applyKit: vi.fn(),
      listKits: vi.fn(() => []),
      getKit: vi.fn(() => undefined),
      detectBase: vi.fn(() => "node"),
    })),
    // T3/T5b injected deps
    runConformance: vi.fn(async () => allPassResults),
    conformanceDeps: vi.fn(() => ({
      makeStorage: vi.fn(),
      makeCompute: vi.fn(),
      makeDA: vi.fn(),
      testWallet: vi.fn(),
    })),
    runKitConformance: vi.fn(async () => []),
    ...over,
  } as unknown as ProgramDeps;

  return { d: base, lines, errLines };
}

// ---------------------------------------------------------------------------
// T3 — 0g test (conformance runner)
// ---------------------------------------------------------------------------

describe("0g test", () => {
  beforeEach(() => {
    process.exitCode = 0;
  });
  afterEach(() => {
    process.exitCode = 0;
  });

  it("default run calls runConformance with all four suites (no --suite flag)", async () => {
    const { d, lines } = makeDeps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["test", "--json"], { from: "user" });

    // runConformance called once with no suites restriction (undefined or all)
    expect(d.runConformance).toHaveBeenCalledOnce();
    const callArg = (d.runConformance as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      suites?: string[];
    };
    // When no --suite flag, suites is undefined (runConformance will default to all)
    expect(callArg.suites).toBeUndefined();

    const out = JSON.parse(lines.at(-1)!);
    expect(out.ok).toBe(true);
    expect(out.results).toHaveLength(4);
  });

  it("--suite=storage,da passes exactly those two suites to runConformance", async () => {
    const { d } = makeDeps({
      runConformance: vi.fn(async () => [
        { name: "storage", ok: true, detail: "ok" },
        { name: "da", ok: true, detail: "ok" },
      ]),
    });
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["test", "--suite", "storage,da", "--local"], { from: "user" });

    expect(d.runConformance).toHaveBeenCalledOnce();
    const callArg = (d.runConformance as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      suites?: string[];
    };
    expect(callArg.suites).toEqual(["storage", "da"]);
  });

  it("all-pass: exitCode stays 0 and human output has 'all conformance suites passed'", async () => {
    const { d, lines } = makeDeps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["test"], { from: "user" });

    expect(process.exitCode).toBe(0);
    const output = lines.join("\n");
    expect(output).toContain("all conformance suites passed");
  });

  it("failing suite sets process.exitCode = 1", async () => {
    const { d, lines } = makeDeps({
      runConformance: vi.fn(async () => [
        { name: "storage", ok: false, detail: "connection refused" },
        { name: "compute", ok: true, detail: "ok" },
        { name: "da", ok: true, detail: "ok" },
        { name: "wallet", ok: true, detail: "ok" },
      ]),
    });
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["test"], { from: "user" });

    expect(process.exitCode).toBe(1);
    const output = lines.join("\n");
    expect(output).toContain("1 suite(s) failed");
    expect(output).toContain("✗ storage");
  });

  it("--galileo uses the live network path (default behavior)", async () => {
    const { d } = makeDeps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["test", "--galileo"], { from: "user" });

    // conformanceDeps called with local=false (galileo is the default live network)
    expect(d.conformanceDeps).toHaveBeenCalledWith(
      expect.objectContaining({ local: undefined })
    );
  });

  it("--local swaps network path to local", async () => {
    const { d } = makeDeps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["test", "--local"], { from: "user" });

    expect(d.conformanceDeps).toHaveBeenCalledWith(
      expect.objectContaining({ local: true })
    );
  });

  it("--suite=bogus surfaces a ConfigError (exitCode=1) without touching runConformance", async () => {
    const { d } = makeDeps();
    const p = buildProgram(d);
    p.exitOverride();

    // The ConfigError is caught by runCommand which sets exitCode=1; it does NOT
    // throw from parseAsync — runCommand swallows it and renders the failure.
    await p.parseAsync(["test", "--suite", "bogus"], { from: "user" });

    expect(process.exitCode).toBe(1);
    // runConformance must never be called — validation fires before the lazy import.
    expect(d.runConformance).not.toHaveBeenCalled();
  });

  it("--suite=storage,bogus lists the invalid name in the error output", async () => {
    const { d, lines } = makeDeps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["test", "--suite", "storage,bogus", "--json"], {
      from: "user",
    });

    expect(process.exitCode).toBe(1);
    expect(d.runConformance).not.toHaveBeenCalled();
    const out = JSON.parse(lines.at(-1)!);
    expect(out.ok).toBe(false);
    expect(out.error.message).toMatch(/bogus/);
    expect(out.error.message).toMatch(/storage, compute, da, wallet/);
  });

  it("human output includes per-suite checkmarks and the network header", async () => {
    const { d, lines } = makeDeps({
      runConformance: vi.fn(async () => [
        { name: "storage", ok: true, detail: "upload→download ok" },
        { name: "da", ok: false, detail: "publish timed out" },
      ]),
    });
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["test"], { from: "user" });

    const output = lines.join("\n");
    expect(output).toContain("0g test");
    expect(output).toContain("✓ storage");
    expect(output).toContain("✗ da");
  });
});

// ---------------------------------------------------------------------------
// T5b — 0g test --kits
// ---------------------------------------------------------------------------

describe("0g test --kits", () => {
  beforeEach(() => {
    process.exitCode = 0;
  });
  afterEach(() => {
    process.exitCode = 0;
  });

  it("includes kit conformance note lines in the human output", async () => {
    const { d, lines } = makeDeps({
      runKitConformance: vi.fn(async () => ["  ✓ agent-memory: remember→recall ok"]),
    });
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["test", "--kits"], { from: "user" });

    const output = lines.join("\n");
    expect(output).toContain("agent-memory: remember→recall ok");
    expect(d.runKitConformance).toHaveBeenCalledOnce();
    expect(d.runKitConformance).toHaveBeenCalledWith("/tmp/test-proj");
  });

  it("when no kits applied runKitConformance returns the informational note", async () => {
    const { d, lines } = makeDeps({
      runKitConformance: vi.fn(async () => ["no kits applied — run `0g add <kit>`"]),
    });
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["test", "--kits"], { from: "user" });

    const output = lines.join("\n");
    expect(output).toContain("no kits applied — run `0g add <kit>`");
    // process.exitCode must NOT be 1 — informational only
    expect(process.exitCode).toBe(0);
  });

  it("without --kits flag, runKitConformance is NOT called", async () => {
    const { d } = makeDeps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["test"], { from: "user" });

    expect(d.runKitConformance).not.toHaveBeenCalled();
  });

  it("kit notes appear in the json output", async () => {
    const { d, lines } = makeDeps({
      runKitConformance: vi.fn(async () => ["  ✓ agent-memory: ok"]),
    });
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["test", "--kits", "--json"], { from: "user" });

    const out = JSON.parse(lines.at(-1)!);
    expect(out.ok).toBe(true);
    expect(out.kits).toEqual(["  ✓ agent-memory: ok"]);
  });
});
