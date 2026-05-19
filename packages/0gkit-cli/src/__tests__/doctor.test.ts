import { describe, it, expect, vi } from "vitest";
import { buildProgram, type ProgramDeps } from "../program.js";

function deps(over: Partial<ProgramDeps> = {}) {
  const lines: string[] = [];
  const base = {
    createClient: vi.fn(() => ({
      network: { name: "galileo", chainId: 16602, explorer: "https://e" },
      public: { getChainId: vi.fn(async () => 16602) },
    })),
    getNetwork: vi.fn(() => ({
      name: "galileo",
      chainId: 16602,
      rpcUrl: "https://rpc",
      explorer: "https://e",
      faucetWebUrl: "https://faucet.0g.ai",
      testnet: true,
    })),
    faucet: vi.fn(),
    balance: vi.fn(async () => 2000000000000000000n),
    fetch: vi.fn(async () => ({ status: 200 })),
    waitForReceipt: vi.fn(),
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

describe("0g doctor", () => {
  it("all-green when RPC chainId matches and key funded (json)", async () => {
    const { d, lines } = deps({
      env: { ZEROG_PRIVATE_KEY: "0x" + "1".repeat(64) },
    });
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["doctor", "--json"], { from: "user" });
    const out = JSON.parse(lines.at(-1)!);
    expect(out.ok).toBe(true);
    const byName = Object.fromEntries(out.checks.map((c: any) => [c.name, c.ok]));
    expect(byName.rpc).toBe(true);
    expect(byName.signer).toBe(true);
  });

  it("rpc check red + exit 1 + hint when chainId mismatches", async () => {
    const { d, lines } = deps({
      createClient: vi.fn(
        () =>
          ({
            network: { name: "galileo" as const, chainId: 16602, testnet: true },
            public: { getChainId: vi.fn(async () => 999) },
          }) as any
      ),
    });
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["doctor", "--json"], { from: "user" });
    const out = JSON.parse(lines.at(-1)!);
    expect(out.ok).toBe(false);
    const rpc = out.checks.find((c: any) => c.name === "rpc");
    expect(rpc.ok).toBe(false);
    expect(rpc.hint).toContain("chain");
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it("degrades gracefully when RPC throws (no crash, red check)", async () => {
    const { d, lines } = deps({
      createClient: vi.fn(
        () =>
          ({
            network: { name: "galileo" as const, chainId: 16602, testnet: true },
            public: {
              getChainId: vi.fn(async () => {
                throw new Error("ECONNREFUSED");
              }),
            },
          }) as any
      ),
    });
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["doctor", "--json"], { from: "user" });
    const out = JSON.parse(lines.at(-1)!);
    expect(out.ok).toBe(false);
    expect(out.checks.find((c: any) => c.name === "rpc").ok).toBe(false);
    process.exitCode = 0;
  });

  it("signer check is a soft warning (not failing) when no key set", async () => {
    const { d, lines } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["doctor", "--json"], { from: "user" });
    const out = JSON.parse(lines.at(-1)!);
    const signer = out.checks.find((c: any) => c.name === "signer");
    expect(signer.ok).toBe(false);
    expect(signer.required).toBe(false);
    expect(out.ok).toBe(true); // soft check does not fail the run
    process.exitCode = 0;
  });
});
