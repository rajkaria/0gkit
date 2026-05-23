import { describe, expect, it, vi } from "vitest";
import {
  aggregateJaegerDump,
  forecastToJson,
  renderForecast,
} from "../commands/jaeger.js";
import { buildProgram, type ProgramDeps } from "../program.js";

function tag(key: string, value: string | number | boolean, type?: string) {
  return type ? { key, value, type } : { key, value };
}

function span(op: string, extra: Array<ReturnType<typeof tag>> = []) {
  return {
    operationName: `0gkit.${op}`,
    tags: [tag("0gkit.op", op), ...extra],
    process: { serviceName: "demo" },
  };
}

function dump(spans: ReturnType<typeof span>[]) {
  return { data: [{ traceID: "abc", spans }] };
}

describe("aggregateJaegerDump", () => {
  it("aggregates fees + gas per op and totals across traces", () => {
    const trace = dump([
      span("storage.upload", [
        tag("0gkit.fee_native", "1000000000", "string"),
        tag("0gkit.gas_native", "80000", "string"),
        tag("0gkit.size_bytes", 1024, "int64"),
        tag("0gkit.segments", 1, "int64"),
      ]),
      span("storage.upload", [
        tag("0gkit.fee_native", "2000000000"),
        tag("0gkit.gas_native", "160000"),
        tag("0gkit.size_bytes", 4096),
        tag("0gkit.segments", 1),
      ]),
      span("compute.inference", [
        tag("0gkit.fee_native", "500000000"),
        tag("0gkit.gas_native", "0"),
        tag("0gkit.input_tokens", 100),
        tag("0gkit.output_tokens", 256),
      ]),
      span("da.publish", [
        tag("0gkit.fee_native", "512000000"),
        tag("0gkit.gas_native", "0"),
        tag("0gkit.size_bytes", 512),
      ]),
    ]);

    const f = aggregateJaegerDump(trace);

    expect(f.spansScanned).toBe(4);
    expect(f.spansAttributed).toBe(4);
    expect(f.spansSkipped).toBe(0);
    expect(f.byOp["storage.upload"]).toEqual({
      count: 2,
      totalGas: 240_000n,
      totalFeeWei: 3_000_000_000n,
      totalSizeBytes: 5120,
      totalSegments: 2,
    });
    expect(f.byOp["compute.inference"]).toEqual({
      count: 1,
      totalGas: 0n,
      totalFeeWei: 500_000_000n,
      totalInputTokens: 100,
      totalOutputTokens: 256,
    });
    expect(f.byOp["da.publish"]).toEqual({
      count: 1,
      totalGas: 0n,
      totalFeeWei: 512_000_000n,
      totalSizeBytes: 512,
    });
    expect(f.totalGas).toBe(240_000n);
    expect(f.totalFeeWei).toBe(4_012_000_000n);
  });

  it("ignores spans without 0gkit.op", () => {
    const trace = {
      data: [
        {
          spans: [
            { operationName: "http.request", tags: [tag("http.method", "GET")] },
            span("storage.upload", [tag("0gkit.fee_native", "100")]),
          ],
        },
      ],
    };
    const f = aggregateJaegerDump(trace);
    expect(f.spansScanned).toBe(2);
    expect(f.spansAttributed).toBe(1);
    expect(f.totalFeeWei).toBe(100n);
  });

  it("skips dry-run spans from totals but counts them under spansSkipped", () => {
    const trace = dump([
      span("storage.upload", [
        tag("0gkit.fee_native", "1000000000"),
        tag("0gkit.dry_run", true, "bool"),
      ]),
      span("storage.upload", [tag("0gkit.fee_native", "2000000000")]),
    ]);
    const f = aggregateJaegerDump(trace);
    expect(f.spansAttributed).toBe(2);
    expect(f.spansSkipped).toBe(1);
    expect(f.byOp["storage.upload"]!.count).toBe(1);
    expect(f.totalFeeWei).toBe(2_000_000_000n);
  });

  it("skips errored spans (any span carrying 0gkit.error_code)", () => {
    const trace = dump([
      span("compute.inference", [
        tag("0gkit.fee_native", "9999999999"),
        tag("0gkit.error_code", "COMPUTE_PROVIDER_UNREACHABLE", "string"),
      ]),
      span("compute.inference", [tag("0gkit.fee_native", "500000000")]),
    ]);
    const f = aggregateJaegerDump(trace);
    expect(f.spansSkipped).toBe(1);
    expect(f.totalFeeWei).toBe(500_000_000n);
  });

  it("dry_run accepts both boolean true and string 'true'", () => {
    const trace = dump([
      span("storage.upload", [
        tag("0gkit.fee_native", "1"),
        tag("0gkit.dry_run", "true", "string"),
      ]),
    ]);
    expect(aggregateJaegerDump(trace).spansSkipped).toBe(1);
  });

  it("handles missing fee/gas tags as 0", () => {
    const trace = dump([span("da.publish", [])]);
    const f = aggregateJaegerDump(trace);
    expect(f.byOp["da.publish"]!.totalFeeWei).toBe(0n);
    expect(f.byOp["da.publish"]!.totalGas).toBe(0n);
  });

  it("tolerates traces with no spans / empty data array", () => {
    expect(aggregateJaegerDump({ data: [] }).spansScanned).toBe(0);
    expect(aggregateJaegerDump({ data: [{ traceID: "x" }] }).spansScanned).toBe(0);
  });

  it("throws ConfigError on non-object input", () => {
    expect(() => aggregateJaegerDump(null)).toThrow(/not an object/);
    expect(() => aggregateJaegerDump("hello")).toThrow(/not an object/);
  });

  it("throws ConfigError when `data` is missing or not an array", () => {
    expect(() => aggregateJaegerDump({})).toThrow(/no `data` array/);
    expect(() => aggregateJaegerDump({ data: "oops" })).toThrow(/no `data` array/);
  });

  it("merges across multiple traces in the same dump", () => {
    const d = {
      data: [
        { spans: [span("storage.upload", [tag("0gkit.fee_native", "100")])] },
        { spans: [span("storage.upload", [tag("0gkit.fee_native", "200")])] },
      ],
    };
    expect(aggregateJaegerDump(d).byOp["storage.upload"]!.totalFeeWei).toBe(300n);
  });
});

describe("renderForecast", () => {
  it("emits header + per-op + total lines", () => {
    const trace = dump([
      span("storage.upload", [
        tag("0gkit.fee_native", "1000000000"),
        tag("0gkit.gas_native", "80000"),
        tag("0gkit.size_bytes", 1024),
      ]),
    ]);
    const lines = renderForecast(aggregateJaegerDump(trace), "trace.json");
    const joined = lines.join("\n");
    expect(joined).toMatch(/Forecast from jaeger \(trace\.json\)/);
    expect(joined).toMatch(/storage\.upload/);
    expect(joined).toMatch(/count=1/);
    expect(joined).toMatch(/feeWei=1000000000/);
    expect(joined).toMatch(/sizeBytes=1024/);
    expect(joined).toMatch(/Total: gas=80000 feeWei=1000000000/);
  });

  it("notes when no 0gkit.* spans are found", () => {
    const lines = renderForecast(aggregateJaegerDump({ data: [] }), "empty.json");
    expect(lines.join("\n")).toMatch(/no 0gkit\.\* spans/);
  });

  it("notes skipped span count when > 0", () => {
    const trace = dump([
      span("storage.upload", [
        tag("0gkit.fee_native", "1"),
        tag("0gkit.dry_run", true),
      ]),
    ]);
    const lines = renderForecast(aggregateJaegerDump(trace), "t.json");
    expect(lines.join("\n")).toMatch(/skipped\s+1/);
  });
});

describe("forecastToJson", () => {
  it("serialises bigints as strings and preserves optional breakdown fields", () => {
    const trace = dump([
      span("compute.inference", [
        tag("0gkit.fee_native", "5000000000"),
        tag("0gkit.gas_native", "0"),
        tag("0gkit.input_tokens", 50),
        tag("0gkit.output_tokens", 100),
      ]),
    ]);
    const json = forecastToJson(aggregateJaegerDump(trace), "t.json");
    expect(json.source).toBe("jaeger");
    expect(json.file).toBe("t.json");
    expect(json.totalFeeWei).toBe("5000000000");
    expect(json.totalGas).toBe("0");
    const byOp = json.byOp as Record<string, Record<string, unknown>>;
    expect(byOp["compute.inference"]).toEqual({
      count: 1,
      totalGas: "0",
      totalFeeWei: "5000000000",
      totalInputTokens: 50,
      totalOutputTokens: 100,
    });
  });
});

/* ─── CLI wiring ──────────────────────────────────────────────────── */

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
    storageEstimate: vi.fn(),
    computeEstimate: vi.fn(),
    daEstimate: vi.fn(),
    ...over,
  } as unknown as ProgramDeps;
  return { d: base, lines };
}

function lastJson(lines: string[]): Record<string, unknown> {
  return JSON.parse(lines.at(-1)!) as Record<string, unknown>;
}

function jaegerFileBytes(dumpObj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(dumpObj));
}

describe("0g cost forecast --from-jaeger", () => {
  it("aggregates a trace file (--json)", async () => {
    const { d, lines } = makeDeps();
    (d.fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      jaegerFileBytes(
        dump([
          span("storage.upload", [
            tag("0gkit.fee_native", "1000000000"),
            tag("0gkit.gas_native", "80000"),
            tag("0gkit.size_bytes", 1024),
          ]),
          span("compute.inference", [tag("0gkit.fee_native", "500000000")]),
        ])
      )
    );
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["--json", "cost", "forecast", "--from-jaeger", "trace.json"], {
      from: "user",
    });
    const result = lastJson(lines);
    expect(result.ok).toBe(true);
    expect(result.source).toBe("jaeger");
    expect(result.file).toBe("trace.json");
    expect(result.totalFeeWei).toBe("1500000000");
    expect(d.fs.readFile).toHaveBeenCalledWith("trace.json");
  });

  it("emits human-readable forecast without --json", async () => {
    const { d, lines } = makeDeps();
    (d.fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      jaegerFileBytes(dump([span("da.publish", [tag("0gkit.fee_native", "1000")])]))
    );
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["cost", "forecast", "--from-jaeger", "t.json"], {
      from: "user",
    });
    const joined = lines.join("\n");
    expect(joined).toMatch(/Forecast from jaeger \(t\.json\)/);
    expect(joined).toMatch(/da\.publish/);
    expect(joined).toMatch(/Total: gas=0 feeWei=1000/);
  });

  it("rejects mixing --from-jaeger with --storage", async () => {
    const { d, lines } = makeDeps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(
      ["--json", "cost", "forecast", "--from-jaeger", "t.json", "--storage", "1024"],
      { from: "user" }
    );
    const result = lastJson(lines);
    expect(result.ok).toBe(false);
    expect((result.error as { code: string }).code).toBe("CONFIG_INVALID_ARGUMENT");
  });

  it("surfaces a clear error when the file is unreadable", async () => {
    const { d, lines } = makeDeps();
    (d.fs.readFile as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("ENOENT: no such file or directory")
    );
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(
      ["--json", "cost", "forecast", "--from-jaeger", "missing.json"],
      { from: "user" }
    );
    const result = lastJson(lines);
    expect(result.ok).toBe(false);
    const err = result.error as { code: string; message: string };
    expect(err.code).toBe("CONFIG_INVALID_ARGUMENT");
    expect(err.message).toMatch(/missing\.json/);
  });

  it("surfaces a clear error on malformed JSON", async () => {
    const { d, lines } = makeDeps();
    (d.fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new TextEncoder().encode("{not json")
    );
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["--json", "cost", "forecast", "--from-jaeger", "bad.json"], {
      from: "user",
    });
    const result = lastJson(lines);
    expect(result.ok).toBe(false);
    expect((result.error as { message: string }).message).toMatch(/not valid JSON/);
  });

  it("reports zero-attributed-spans gracefully (still ok)", async () => {
    const { d, lines } = makeDeps();
    (d.fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      jaegerFileBytes({
        data: [
          {
            spans: [
              { operationName: "http.request", tags: [tag("http.method", "GET")] },
            ],
          },
        ],
      })
    );
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(
      ["--json", "cost", "forecast", "--from-jaeger", "irrelevant.json"],
      { from: "user" }
    );
    const result = lastJson(lines);
    expect(result.ok).toBe(true);
    expect(result.spansAttributed).toBe(0);
    expect(result.totalFeeWei).toBe("0");
    const byOp = result.byOp as Record<string, unknown>;
    expect(Object.keys(byOp)).toHaveLength(0);
  });
});
