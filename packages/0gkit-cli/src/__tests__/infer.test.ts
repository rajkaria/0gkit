import { describe, it, expect, vi } from "vitest";
import { Compute } from "@foundryprotocol/0gkit-compute";
import { buildProgram, type ProgramDeps } from "../program.js";

function deps(over: Partial<ProgramDeps> = {}) {
  const lines: string[] = [];
  const compute = {
    inference: vi.fn(async () => ({
      output: "hello from 0G",
      receipt: { txHash: "0xfee", latencyMs: 42 },
      raw: {},
    })),
  };
  const base = {
    createClient: vi.fn(),
    getNetwork: vi.fn(),
    faucet: vi.fn(),
    balance: vi.fn(),
    waitForReceipt: vi.fn(),
    attachExplorerUrl: vi.fn((r) => r),
    explorerUrl: vi.fn(),
    makeStorage: vi.fn(),
    makeCompute: vi.fn(() => compute),
    makeDA: vi.fn(),
    attest: {
      parseEnvelope: vi.fn(),
      verifyEnvelope: vi.fn(),
      reportEnvelope: vi.fn(),
    },
    loadFoundry: vi.fn(async () => null),
    fs: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      readdir: vi.fn(async () => []),
      exists: vi.fn(async () => false),
    },
    readStdin: vi.fn(async () => new TextEncoder().encode("from stdin")),
    cwd: () => "/w",
    env: { ZEROG_BROKER_KEY: "0x" + "1".repeat(64), ZEROG_PROVIDER: "0xprov" },
    isTTY: false,
    noColor: true,
    write: (s: string) => lines.push(s),
    ...over,
  } as unknown as ProgramDeps;
  return { d: base, lines, compute };
}

describe("0g infer", () => {
  it("runs inference from -m and prints output + receipt", async () => {
    const { d, lines, compute } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["infer", "-m", "hi there", "--provider", "0xprov", "--json"], {
      from: "user",
    });
    expect(compute.inference).toHaveBeenCalledWith({
      messages: [{ role: "user", content: "hi there" }],
      model: undefined,
      temperature: undefined,
    });
    expect(JSON.parse(lines.at(-1)!)).toMatchObject({
      ok: true,
      output: "hello from 0G",
      txHash: "0xfee",
    });
  });

  it("reads the prompt from stdin when no -m", async () => {
    const { d, compute } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["infer", "--provider", "0xprov", "--json"], {
      from: "user",
    });
    expect(compute.inference).toHaveBeenCalledWith({
      messages: [{ role: "user", content: "from stdin" }],
      model: undefined,
      temperature: undefined,
    });
  });

  it("errors with a hint when no broker key", async () => {
    const { d, lines } = deps({ env: { ZEROG_PROVIDER: "0xprov" } });
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["infer", "-m", "x", "--json"], { from: "user" });
    const out = JSON.parse(lines.at(-1)!);
    expect(out.ok).toBe(false);
    expect(out.error.hint).toContain("ZEROG_BROKER_KEY");
    process.exitCode = 0;
  });
});

describe("0g infer --dry-run", () => {
  // Compute.inference({ dryRun: true }) never touches the broker, so a
  // fetch impl that throws guarantees nothing is dialed during dry-run.
  const noFetch = (async () => {
    throw new Error("--dry-run must not call fetch");
  }) as unknown as typeof fetch;

  function dryRunDeps(over: Partial<ProgramDeps> = {}) {
    const lines: string[] = [];
    const makeCompute = (cfg: ConstructorParameters<typeof Compute>[0]) =>
      new Compute({ ...cfg, fetch: noFetch });
    const base = {
      createClient: vi.fn(),
      getNetwork: vi.fn(),
      faucet: vi.fn(),
      balance: vi.fn(),
      waitForReceipt: vi.fn(),
      attachExplorerUrl: vi.fn((r) => r),
      explorerUrl: vi.fn(),
      makeStorage: vi.fn(),
      makeCompute: vi.fn(makeCompute),
      makeDA: vi.fn(),
      attest: {
        parseEnvelope: vi.fn(),
        verifyEnvelope: vi.fn(),
        reportEnvelope: vi.fn(),
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
      cwd: () => "/w",
      // No ZEROG_BROKER_KEY, no ZEROG_PROVIDER: the dry-run path must bypass
      // both preflight checks.
      env: {},
      isTTY: false,
      noColor: true,
      write: (s: string) => lines.push(s),
      ...over,
    } as unknown as ProgramDeps;
    return { d: base, lines };
  }

  it("returns a structured DryRunResult without provider or broker key (--json)", async () => {
    const { d, lines } = dryRunDeps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["infer", "-m", "ping", "--dry-run", "--json"], {
      from: "user",
    });
    const out = JSON.parse(lines.at(-1)!);
    expect(out.ok).toBe(true);
    expect(out.dryRun).toBe(true);
    expect(out.estimate.kind).toBe("compute");
    expect(typeof out.estimate.gas).toBe("string");
    expect(typeof out.estimate.fee).toBe("string");
    expect(out.result.output).toBe("");
    expect(out.result.receipt.txHash ?? null).toBeNull();
  });

  it("prints [dry-run] human lines by default", async () => {
    const { d, lines } = dryRunDeps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["infer", "-m", "ping", "--dry-run"], { from: "user" });
    const out = lines.join("\n");
    expect(out).toContain("[dry-run] would call provider 0x");
    expect(out).toContain("kind        compute");
  });

  it("errors when --dry-run is used without -m or stdin", async () => {
    const { d, lines } = dryRunDeps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["infer", "--dry-run", "--json"], { from: "user" });
    const out = JSON.parse(lines.at(-1)!);
    expect(out.ok).toBe(false);
    expect(out.error.code).toBe("CONFIG");
    expect(out.error.message).toContain("No prompt");
    process.exitCode = 0;
  });
});
