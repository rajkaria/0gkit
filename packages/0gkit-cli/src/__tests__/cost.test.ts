import { describe, expect, it, vi } from "vitest";
import type { Estimate } from "@foundryprotocol/0gkit-core";
import { buildProgram, type ProgramDeps } from "../program.js";

function makeDeps(over: Partial<ProgramDeps> = {}): {
  d: ProgramDeps;
  lines: string[];
} {
  const lines: string[] = [];
  const base = {
    createClient: vi.fn(),
    getNetwork: vi.fn(() => ({ name: "galileo", explorer: "https://e" })),
    faucet: vi.fn(),
    balance: vi.fn(),
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
    devnet: {
      startDevnet: vi.fn(),
      stopDevnet: vi.fn(),
      isRunning: vi.fn(),
      readState: vi.fn(),
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
    fs: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      readdir: vi.fn(),
      exists: vi.fn(),
    },
    readStdin: vi.fn(),
    fetch: vi.fn(),
    cwd: () => "/w",
    env: {},
    isTTY: false,
    noColor: true,
    write: (s: string) => lines.push(s),
    // SP11 — pure estimate factories
    storageEstimate: vi.fn(
      async (bytes: number): Promise<Estimate> => ({
        kind: "storage",
        gas: 80_000n,
        fee: bytes >= 0 ? 1_000_000_000n : 0n,
        breakdown: { sizeBytes: bytes, segments: 1 },
        expectedSeconds: 8,
      })
    ),
    computeEstimate: vi.fn(
      async ({
        prompt,
        model,
        maxOutputTokens,
      }: {
        prompt: string;
        model?: string;
        maxOutputTokens?: number;
      }): Promise<Estimate> => ({
        kind: "compute",
        gas: 0n,
        fee: 500_000_000n,
        breakdown: {
          inputTokens: Math.ceil(prompt.length / 4),
          outputTokensMax: maxOutputTokens ?? 512,
          model: model ?? "(provider default)",
        },
        expectedSeconds: 5,
      })
    ),
    daEstimate: vi.fn(
      async (bytes: number): Promise<Estimate> => ({
        kind: "da",
        gas: 0n,
        fee: BigInt(bytes) * 1_000_000n,
        breakdown: { sizeBytes: bytes, mode: "live" },
        expectedSeconds: 4,
      })
    ),
    ...over,
  } as unknown as ProgramDeps;
  return { d: base, lines };
}

function lastJson(lines: string[]): Record<string, unknown> {
  return JSON.parse(lines.at(-1)!) as Record<string, unknown>;
}

describe("0g cost forecast", () => {
  it("aggregates storage + compute + da estimates (--json)", async () => {
    const { d, lines } = makeDeps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(
      [
        "--json",
        "cost",
        "forecast",
        "--storage",
        "1024",
        "--compute",
        "hello|llama-3-8b|256",
        "--da",
        "512",
      ],
      { from: "user" }
    );
    const result = lastJson(lines);
    expect(result.ok).toBe(true);
    const byOp = result.byOp as {
      storage: unknown[];
      compute: unknown[];
      da: unknown[];
    };
    expect(byOp.storage).toHaveLength(1);
    expect(byOp.compute).toHaveLength(1);
    expect(byOp.da).toHaveLength(1);
    // Total fee = storage 1e9 + compute 5e8 + da 512e6 = 2_012_000_000
    expect(result.totalFeeWei).toBe("2012000000");
    expect(result.totalGas).toBe("80000");
  });

  it("supports multiple --storage flags accumulating into one array", async () => {
    const { d, lines } = makeDeps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(
      ["--json", "cost", "forecast", "--storage", "1024", "--storage", "4096"],
      { from: "user" }
    );
    const result = lastJson(lines);
    const byOp = result.byOp as { storage: unknown[] };
    expect(byOp.storage).toHaveLength(2);
  });

  it("supports comma-separated values inside a single --storage flag", async () => {
    const { d, lines } = makeDeps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["--json", "cost", "forecast", "--storage", "1024,4096,16384"], {
      from: "user",
    });
    const result = lastJson(lines);
    const byOp = result.byOp as { storage: unknown[] };
    expect(byOp.storage).toHaveLength(3);
  });

  it("emits human-readable output without --json", async () => {
    const { d, lines } = makeDeps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["cost", "forecast", "--storage", "1024", "--da", "512"], {
      from: "user",
    });
    const joined = lines.join("\n");
    expect(joined).toMatch(/Forecast:/);
    expect(joined).toMatch(/storage:/);
    expect(joined).toMatch(/da:/);
    expect(joined).toMatch(/Total: gas=80000 feeWei=1512000000/);
  });

  it("fails with CONFIG_INVALID_ARGUMENT when no ops are supplied", async () => {
    const { d, lines } = makeDeps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["--json", "cost", "forecast"], { from: "user" });
    const result = lastJson(lines);
    expect(result.ok).toBe(false);
    const err = result.error as { code: string };
    expect(err.code).toBe("CONFIG_INVALID_ARGUMENT");
  });

  it("rejects negative byte counts for --storage", async () => {
    const { d } = makeDeps();
    const p = buildProgram(d);
    p.exitOverride();
    // The --storage parser throws synchronously; commander wraps the message
    // and re-throws under exitOverride. We assert the error code surfaces.
    await expect(
      p.parseAsync(["--json", "cost", "forecast", "--storage", "-1"], {
        from: "user",
      })
    ).rejects.toThrow(/non-negative/);
  });

  it("rejects an empty prompt in --compute", async () => {
    const { d, lines } = makeDeps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["--json", "cost", "forecast", "--compute", "|llama|512"], {
      from: "user",
    });
    const result = lastJson(lines);
    expect(result.ok).toBe(false);
  });

  it("parses --compute without model + maxTokens (just prompt)", async () => {
    const { d, lines } = makeDeps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["--json", "cost", "forecast", "--compute", "just a prompt"], {
      from: "user",
    });
    const result = lastJson(lines);
    expect(result.ok).toBe(true);
    expect(d.computeEstimate).toHaveBeenCalledWith({
      prompt: "just a prompt",
      model: undefined,
      maxOutputTokens: undefined,
    });
  });

  it("--from-jaeger - reads from stdin and aggregates (SP14)", async () => {
    const stdinPayload = JSON.stringify({
      data: [
        {
          traceID: "x",
          spans: [
            {
              operationName: "0gkit.storage.upload",
              tags: [
                { key: "0gkit.op", value: "storage.upload" },
                { key: "0gkit.fee_native", value: "777" },
              ],
            },
          ],
        },
      ],
    });
    const { d, lines } = makeDeps({
      readStdin: vi.fn(async () => new TextEncoder().encode(stdinPayload)),
    });
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["--json", "cost", "forecast", "--from-jaeger", "-"], {
      from: "user",
    });
    const result = lastJson(lines);
    expect(result.ok).toBe(true);
    const byOp = result.byOp as Record<string, { totalFeeWei: string }>;
    expect(byOp["storage.upload"].totalFeeWei).toBe("777");
    expect(result.file).toBe("<stdin>");
  });

  it("--from-jaeger - throws ConfigError on invalid JSON via stdin (SP14)", async () => {
    const { d, lines } = makeDeps({
      readStdin: vi.fn(async () => new TextEncoder().encode("{not json")),
    });
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["--json", "cost", "forecast", "--from-jaeger", "-"], {
      from: "user",
    });
    const result = lastJson(lines);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).toMatch(/stdin is not valid JSON/);
  });
});
