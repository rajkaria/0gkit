import { describe, it, expect, vi } from "vitest";
import { ConfigError } from "@foundryprotocol/0gkit-core";
import { buildProgram, type ProgramDeps } from "../program.js";

function deps(over: Partial<ProgramDeps> = {}) {
  const lines: string[] = [];
  const base = {
    createClient: vi.fn(() => ({
      network: { name: "galileo", explorer: "https://e" },
    })),
    getNetwork: vi.fn((n: string) => ({
      name: n,
      faucetWebUrl: "https://faucet.0g.ai",
    })),
    faucet: vi.fn(),
    balance: vi.fn(async () => 1500000000000000000n),
    waitForReceipt: vi.fn(async () => ({
      txHash: "0xdead",
      blockNumber: 9n,
      latencyMs: 12,
      explorerUrl: "https://e/tx/0xdead",
    })),
    attachExplorerUrl: vi.fn((r) => r),
    explorerUrl: vi.fn(),
    makeStorage: vi.fn(),
    makeCompute: vi.fn(),
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
    cwd: () => "/tmp",
    env: {},
    isTTY: false,
    noColor: true,
    write: (s: string) => lines.push(s),
    ...over,
  } as unknown as ProgramDeps;
  return { d: base, lines };
}

const ADDR = "0x1111111111111111111111111111111111111111";

describe("0g chain", () => {
  it("balance prints wei + 0G (json)", async () => {
    const { d, lines } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["chain", "balance", ADDR, "--json"], { from: "user" });
    expect(JSON.parse(lines.at(-1)!)).toMatchObject({
      ok: true,
      address: ADDR,
      wei: "1500000000000000000",
      zg: "1.5",
    });
  });

  it("tx waits for a receipt and surfaces the explorer link", async () => {
    const { d, lines } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["chain", "tx", "0xdead", "--json"], { from: "user" });
    expect(JSON.parse(lines.at(-1)!)).toMatchObject({
      ok: true,
      txHash: "0xdead",
      blockNumber: "9",
      explorerUrl: "https://e/tx/0xdead",
    });
  });

  it("faucet surfaces the @foundryprotocol/0gkit-chain ConfigError honestly on galileo", async () => {
    const { d, lines } = deps({
      faucet: vi.fn(async () => {
        throw new ConfigError(
          "No programmatic faucet endpoint for network 'galileo'.",
          "Visit https://faucet.0g.ai and request funds for " + ADDR + "."
        );
      }),
    });
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["chain", "faucet", ADDR, "--json"], { from: "user" });
    const out = JSON.parse(lines.at(-1)!);
    expect(out.ok).toBe(false);
    expect(out.error.code).toBe("CONFIG");
    expect(out.error.hint).toContain("faucet.0g.ai");
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });
});
