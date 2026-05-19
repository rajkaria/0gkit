import { describe, it, expect, vi } from "vitest";
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
