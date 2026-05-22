import { describe, it, expect, vi } from "vitest";
import { Storage } from "@foundryprotocol/0gkit-storage";
import { Compute } from "@foundryprotocol/0gkit-compute";
import { DA } from "@foundryprotocol/0gkit-da";
import type { Estimate } from "@foundryprotocol/0gkit-core";
import { buildProgram, type ProgramDeps } from "../program.js";

function deps(over: Partial<ProgramDeps> = {}) {
  const lines: string[] = [];
  const makeStorage = (cfg: ConstructorParameters<typeof Storage>[0]) =>
    new Storage(cfg);
  const makeCompute = (cfg: ConstructorParameters<typeof Compute>[0]) =>
    new Compute(cfg);
  const makeDA = (cfg: ConstructorParameters<typeof DA>[0]) => new DA(cfg);

  const contractsEstimate = vi.fn(
    async (): Promise<Estimate> => ({
      kind: "contract",
      gas: 60_000n,
      fee: 60_000n * 2_000_000_000n,
      breakdown: { method: "ping" },
      expectedSeconds: 3,
    })
  );

  const base = {
    createClient: vi.fn(),
    getNetwork: vi.fn(() => ({ name: "galileo", explorer: "https://e" })),
    faucet: vi.fn(),
    balance: vi.fn(),
    waitForReceipt: vi.fn(),
    attachExplorerUrl: vi.fn((r) => r),
    explorerUrl: vi.fn(),
    makeStorage: vi.fn(makeStorage),
    makeCompute: vi.fn(makeCompute),
    makeDA: vi.fn(makeDA),
    attest: {
      parseEnvelope: vi.fn(),
      verifyEnvelope: vi.fn(),
      reportEnvelope: vi.fn(),
    },
    loadFoundry: vi.fn(async () => null),
    contracts: {
      generate: vi.fn(),
      listStandard: vi.fn(() => []),
      getStandard: vi.fn(() => null),
      estimate: contractsEstimate,
    },
    fs: {
      readFile: vi.fn(async () => new Uint8Array([1, 2, 3, 4, 5])),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      readdir: vi.fn(async () => []),
      exists: vi.fn(async () => false),
    },
    readStdin: vi.fn(async () => new Uint8Array()),
    cwd: () => "/w",
    env: {},
    isTTY: false,
    noColor: true,
    write: (s: string) => lines.push(s),
    ...over,
  } as unknown as ProgramDeps;
  return { d: base, lines };
}

function lastJson(lines: string[]): Record<string, unknown> {
  return JSON.parse(lines.at(-1)!) as Record<string, unknown>;
}

describe("0g estimate contracts error codes", () => {
  it("reports CONFIG_INVALID_ARGUMENT when --args is not a JSON array", async () => {
    const { d, lines } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    const address = "0x" + "a".repeat(40);
    await p.parseAsync(
      [
        "estimate",
        "contracts",
        "--abi",
        "./X.json",
        "--address",
        address,
        "--method",
        "ping",
        "--args",
        '{"not":"an array"}',
        "--json",
      ],
      { from: "user" }
    );
    const out = lastJson(lines);
    expect(out.ok).toBe(false);
    const err = out.error as Record<string, string>;
    expect(err.code).toBe("CONFIG_INVALID_ARGUMENT");
    process.exitCode = 0;
  });
});
