import { describe, it, expect, vi } from "vitest";
import { Storage } from "@foundryprotocol/0gkit-storage";
import { Compute } from "@foundryprotocol/0gkit-compute";
import { DA } from "@foundryprotocol/0gkit-da";
import type { Estimate } from "@foundryprotocol/0gkit-core";
import { buildProgram, type ProgramDeps } from "../program.js";

function deps(over: Partial<ProgramDeps> = {}) {
  const lines: string[] = [];
  // Real primitives — their `.estimate()` is pure / offline (no SDK / RPC).
  // The Storage/Compute constructors don't dial out from `.estimate()`; the
  // SDK loader is only invoked by upload/inference/download, which we never
  // call in these tests.
  const makeStorage = (cfg: ConstructorParameters<typeof Storage>[0]) =>
    new Storage(cfg);
  const makeCompute = (cfg: ConstructorParameters<typeof Compute>[0]) =>
    new Compute(cfg);
  const makeDA = (cfg: ConstructorParameters<typeof DA>[0]) => new DA(cfg);

  const contractsEstimate = vi.fn(
    async (opts: {
      abiPath: string;
      address: `0x${string}`;
      method: string;
      args: unknown[];
      network: string;
      rpcUrl?: string;
    }): Promise<Estimate> => ({
      kind: "contract",
      gas: 60_000n,
      fee: 60_000n * 2_000_000_000n,
      breakdown: {
        method: opts.method,
        gasPrice: 2_000_000_000n,
      },
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
  return { d: base, lines, contractsEstimate };
}

function lastJson(lines: string[]): Record<string, unknown> {
  return JSON.parse(lines.at(-1)!) as Record<string, unknown>;
}

describe("0g estimate storage", () => {
  it("returns ok:true with kind:'storage' and the right sizeBytes (--json)", async () => {
    const { d, lines } = deps({
      fs: {
        readFile: vi.fn(async () => new Uint8Array(1024)),
        writeFile: vi.fn(),
        mkdir: vi.fn(),
        readdir: vi.fn(async () => []),
        exists: vi.fn(async () => false),
      },
    });
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["estimate", "storage", "./blob.bin", "--json"], {
      from: "user",
    });
    const out = lastJson(lines);
    expect(out.ok).toBe(true);
    expect(out.kind).toBe("storage");
    const breakdown = out.breakdown as Record<string, unknown>;
    expect(breakdown.sizeBytes).toBe(1024);
    expect(breakdown.segments).toBe(1);
    // gas/fee come out as strings via bigintsToStrings
    expect(typeof out.gas).toBe("string");
    expect(typeof out.fee).toBe("string");
  });

  it("prints aligned human lines by default", async () => {
    const { d, lines } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["estimate", "storage", "./blob.bin"], { from: "user" });
    const out = lines.join("\n");
    expect(out).toContain("kind        storage");
    expect(out).toMatch(/gas\s+\d+/);
    expect(out).toMatch(/fee\s+/);
  });

  it("rejects --network local with a clear hint", async () => {
    const { d, lines } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(
      ["estimate", "storage", "./blob.bin", "--network", "local", "--json"],
      { from: "user" }
    );
    const out = lastJson(lines);
    expect(out.ok).toBe(false);
    const err = out.error as Record<string, string>;
    expect(err.hint).toContain("galileo");
    process.exitCode = 0;
  });
});

describe("0g estimate compute", () => {
  it("returns kind:'compute' with outputTokensMax matching --max-output", async () => {
    const { d, lines } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(
      [
        "estimate",
        "compute",
        "--prompt",
        "Hello world!",
        "--max-output",
        "64",
        "--json",
      ],
      { from: "user" }
    );
    const out = lastJson(lines);
    expect(out.ok).toBe(true);
    expect(out.kind).toBe("compute");
    const breakdown = out.breakdown as Record<string, unknown>;
    expect(breakdown.outputTokensMax).toBe(64);
    // "Hello world!" is 12 chars → ceil(12/4) = 3 tokens
    expect(breakdown.inputTokens).toBe(3);
  });

  it("uses the model passed via --model in the breakdown", async () => {
    const { d, lines } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(
      ["estimate", "compute", "--prompt", "hi", "--model", "llama-3", "--json"],
      { from: "user" }
    );
    const out = lastJson(lines);
    const breakdown = out.breakdown as Record<string, unknown>;
    expect(breakdown.model).toBe("llama-3");
  });

  it("returns ok:false CONFIG when --prompt is missing", async () => {
    const { d, lines } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["estimate", "compute", "--json"], { from: "user" });
    const out = lastJson(lines);
    expect(out.ok).toBe(false);
    const err = out.error as Record<string, string>;
    expect(err.code).toBe("CONFIG_INVALID_ARGUMENT");
    expect(err.message).toContain("--prompt");
    process.exitCode = 0;
  });
});

describe("0g estimate da", () => {
  it("returns kind:'da' with breakdown.sizeBytes when --bytes is used", async () => {
    const { d, lines } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["estimate", "da", "--bytes", "1024", "--json"], {
      from: "user",
    });
    const out = lastJson(lines);
    expect(out.ok).toBe(true);
    expect(out.kind).toBe("da");
    const breakdown = out.breakdown as Record<string, unknown>;
    expect(breakdown.sizeBytes).toBe(1024);
  });

  it("reads from disk when a file path is given", async () => {
    const { d, lines } = deps({
      fs: {
        readFile: vi.fn(async () => new Uint8Array(2048)),
        writeFile: vi.fn(),
        mkdir: vi.fn(),
        readdir: vi.fn(async () => []),
        exists: vi.fn(async () => false),
      },
    });
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["estimate", "da", "./blob.bin", "--json"], {
      from: "user",
    });
    expect(d.fs.readFile).toHaveBeenCalledWith("./blob.bin");
    const out = lastJson(lines);
    const breakdown = out.breakdown as Record<string, unknown>;
    expect(breakdown.sizeBytes).toBe(2048);
  });

  it("errors when neither file nor --bytes is provided", async () => {
    const { d, lines } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["estimate", "da", "--json"], { from: "user" });
    const out = lastJson(lines);
    expect(out.ok).toBe(false);
    const err = out.error as Record<string, string>;
    expect(err.code).toBe("CONFIG_INVALID_ARGUMENT");
    process.exitCode = 0;
  });

  it("errors when both file and --bytes are provided", async () => {
    const { d, lines } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["estimate", "da", "./blob.bin", "--bytes", "100", "--json"], {
      from: "user",
    });
    const out = lastJson(lines);
    expect(out.ok).toBe(false);
    const err = out.error as Record<string, string>;
    expect(err.code).toBe("CONFIG_INVALID_ARGUMENT");
    process.exitCode = 0;
  });
});

describe("0g estimate contracts", () => {
  it("returns kind:'contract' with breakdown.method from the injected fake", async () => {
    const { d, lines, contractsEstimate } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    const address = "0x" + "a".repeat(40);
    await p.parseAsync(
      [
        "estimate",
        "contracts",
        "--abi",
        "./Greeter.json",
        "--address",
        address,
        "--method",
        "transfer",
        "--args",
        JSON.stringify(["0x" + "b".repeat(40), "1000"]),
        "--json",
      ],
      { from: "user" }
    );
    expect(contractsEstimate).toHaveBeenCalledWith({
      abiPath: "./Greeter.json",
      address,
      method: "transfer",
      args: ["0x" + "b".repeat(40), "1000"],
      network: "galileo",
      rpcUrl: undefined,
    });
    const out = lastJson(lines);
    expect(out.ok).toBe(true);
    expect(out.kind).toBe("contract");
    const breakdown = out.breakdown as Record<string, unknown>;
    expect(breakdown.method).toBe("transfer");
  });

  it("defaults --args to [] when omitted", async () => {
    const { d, contractsEstimate } = deps();
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
        "--json",
      ],
      { from: "user" }
    );
    expect(contractsEstimate).toHaveBeenCalledWith(
      expect.objectContaining({ args: [] })
    );
  });

  it("rejects an invalid address with a CONFIG error", async () => {
    const { d, lines } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(
      [
        "estimate",
        "contracts",
        "--abi",
        "./X.json",
        "--address",
        "0xshort",
        "--method",
        "ping",
        "--json",
      ],
      { from: "user" }
    );
    const out = lastJson(lines);
    expect(out.ok).toBe(false);
    const err = out.error as Record<string, string>;
    expect(err.code).toBe("CONFIG_INVALID_ARGUMENT");
    expect(err.message).toContain("--address");
    process.exitCode = 0;
  });

  it("rejects --args that is not a JSON array", async () => {
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

  it("requires --abi, --address, --method", async () => {
    const { d } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    p.configureOutput({ writeOut: () => {}, writeErr: () => {} });
    await expect(
      p.parseAsync(["estimate", "contracts", "--json"], { from: "user" })
    ).rejects.toThrow(/required option/i);
  });
});
