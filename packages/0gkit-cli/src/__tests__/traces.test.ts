import { describe, expect, it, vi } from "vitest";
import type {
  TraceFileEntry,
  TraceFileSummary,
  TraceRecord,
} from "@foundryprotocol/0gkit-observability";
import type { Estimate } from "@foundryprotocol/0gkit-core";
import { buildProgram, type ProgramDeps } from "../program.js";

interface TracesReaderStub {
  defaultTraceDir: () => string | null;
  listTraceFiles: (dir: string) => Promise<TraceFileEntry[]>;
  readTraceFile: (path: string) => Promise<TraceRecord[]>;
  summarizeTrace: (id: string, recs: TraceRecord[]) => TraceFileSummary;
}

function makeDeps(over: {
  write?: (l: string) => void;
  tracesReader?: TracesReaderStub;
  readStdin?: () => Promise<Uint8Array>;
}): ProgramDeps {
  const noop = vi.fn();
  const baseEstimate: Estimate = {
    kind: "storage",
    gas: 0n,
    fee: 0n,
    breakdown: {},
  };
  return {
    createClient: noop,
    getNetwork: vi.fn(() => ({ name: "galileo", explorer: "https://e" })) as never,
    faucet: noop as never,
    balance: noop as never,
    waitForReceipt: noop as never,
    attachExplorerUrl: vi.fn((r) => r) as never,
    explorerUrl: noop as never,
    makeStorage: noop as never,
    makeCompute: noop as never,
    makeDA: noop as never,
    attest: {
      parseEnvelope: noop as never,
      verifyEnvelope: noop as never,
      reportEnvelope: noop as never,
    },
    devnet: {
      startDevnet: noop as never,
      stopDevnet: noop as never,
      isRunning: noop as never,
      readState: noop as never,
      clearState: noop as never,
    },
    loadFoundry: vi.fn(async () => null),
    contracts: {
      generate: noop as never,
      listStandard: vi.fn(() => []),
      getStandard: vi.fn(() => null),
      estimate: noop as never,
    },
    jobsBackendFactory: noop as never,
    storageEstimate: vi.fn(async () => baseEstimate),
    computeEstimate: vi.fn(async () => baseEstimate),
    daEstimate: vi.fn(async () => baseEstimate),
    tracesReader: over.tracesReader ?? {
      defaultTraceDir: () => null,
      listTraceFiles: async () => [],
      readTraceFile: async () => [],
      summarizeTrace: (id) => ({
        traceId: id,
        spans: 0,
        totalFeeWei: "0",
        totalGas: "0",
        topOp: null,
        ops: {},
      }),
    },
    fs: {
      readFile: noop as never,
      writeFile: noop as never,
      mkdir: noop as never,
      readdir: noop as never,
      exists: noop as never,
    },
    readStdin: over.readStdin ?? vi.fn(async () => new Uint8Array()),
    fetch: noop as never,
    cwd: () => "/w",
    homedir: () => "/home/test",
    env: {},
    isTTY: false,
    noColor: true,
    write: over.write ?? (() => {}),
    argv: [],
    writeErr: () => {},
    packageVersions: () => [],
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  };
}

function recordWith(op: string, fee: string, traceId = "abc"): TraceRecord {
  return {
    traceId,
    spanId: "s1",
    name: `0gkit.${op}`,
    attributes: { "0gkit.op": op, "0gkit.fee_native": fee },
    status: "ok",
    startTimeUnixNano: "1700000000000000000",
    endTimeUnixNano: "1700000000050000000",
  };
}

describe("0g traces list", () => {
  it("lists each trace file with span count, fee total, top op (human mode)", async () => {
    const lines: string[] = [];
    const entries: TraceFileEntry[] = [
      { path: "/t/2026-05-23-abc.jsonl", traceId: "abc", mtimeMs: 2, sizeBytes: 100 },
      { path: "/t/2026-05-23-def.jsonl", traceId: "def", mtimeMs: 1, sizeBytes: 80 },
    ];
    const fileMap: Record<string, TraceRecord[]> = {
      "/t/2026-05-23-abc.jsonl": [
        recordWith("storage.upload", "100", "abc"),
        recordWith("storage.upload", "200", "abc"),
      ],
      "/t/2026-05-23-def.jsonl": [recordWith("compute.inference", "50", "def")],
    };
    const deps = makeDeps({
      write: (l) => lines.push(l),
      tracesReader: {
        defaultTraceDir: () => "/t",
        listTraceFiles: async () => entries,
        readTraceFile: async (p) => fileMap[p] ?? [],
        summarizeTrace: (id, recs) => {
          const fee = recs
            .reduce(
              (acc, r) => acc + BigInt(String(r.attributes["0gkit.fee_native"] ?? 0n)),
              0n
            )
            .toString();
          const ops: Record<string, number> = {};
          for (const r of recs) {
            const op = r.attributes["0gkit.op"] as string;
            ops[op] = (ops[op] ?? 0) + 1;
          }
          const topOp = Object.entries(ops).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
          return {
            traceId: id,
            spans: recs.length,
            totalFeeWei: fee,
            totalGas: "0",
            topOp,
            ops,
          };
        },
      },
    });
    await buildProgram(deps).parseAsync(["node", "0g", "traces", "list"]);
    const out = lines.join("\n");
    expect(out).toContain("Traces in /t (2):");
    expect(out).toContain("abc");
    expect(out).toContain("spans=2");
    expect(out).toContain("feeWei=300");
    expect(out).toContain("storage.upload");
    expect(out).toContain("def");
    expect(out).toContain("compute.inference");
  });

  it("--last N truncates to N most-recent traces", async () => {
    const lines: string[] = [];
    const entries: TraceFileEntry[] = [
      { path: "/t/2026-05-23-a.jsonl", traceId: "a", mtimeMs: 3, sizeBytes: 0 },
      { path: "/t/2026-05-23-b.jsonl", traceId: "b", mtimeMs: 2, sizeBytes: 0 },
      { path: "/t/2026-05-23-c.jsonl", traceId: "c", mtimeMs: 1, sizeBytes: 0 },
    ];
    const deps = makeDeps({
      write: (l) => lines.push(l),
      tracesReader: {
        defaultTraceDir: () => "/t",
        listTraceFiles: async () => entries,
        readTraceFile: async () => [],
        summarizeTrace: (id) => ({
          traceId: id,
          spans: 0,
          totalFeeWei: "0",
          totalGas: "0",
          topOp: null,
          ops: {},
        }),
      },
    });
    await buildProgram(deps).parseAsync([
      "node",
      "0g",
      "traces",
      "list",
      "--last",
      "2",
    ]);
    const out = lines.join("\n");
    expect(out).toContain("Traces in /t (2):");
    expect(out).toMatch(/\ba\b\s+spans/);
    expect(out).toMatch(/\bb\b\s+spans/);
    expect(out).not.toMatch(/\bc\b\s+spans/);
  });

  it("--json emits a structured payload", async () => {
    const lines: string[] = [];
    const deps = makeDeps({
      write: (l) => lines.push(l),
      tracesReader: {
        defaultTraceDir: () => "/t",
        listTraceFiles: async () => [
          { path: "/t/2026-05-23-a.jsonl", traceId: "a", mtimeMs: 1, sizeBytes: 0 },
        ],
        readTraceFile: async () => [recordWith("storage.upload", "10", "a")],
        summarizeTrace: (id, recs) => ({
          traceId: id,
          spans: recs.length,
          totalFeeWei: "10",
          totalGas: "0",
          topOp: "storage.upload",
          ops: { "storage.upload": 1 },
        }),
      },
    });
    await buildProgram(deps).parseAsync(["node", "0g", "traces", "list", "--json"]);
    const parsed = JSON.parse(lines.join("\n"));
    expect(parsed.dir).toBe("/t");
    expect(parsed.count).toBe(1);
    expect(parsed.traces[0]).toMatchObject({
      traceId: "a",
      spans: 1,
      topOp: "storage.upload",
    });
  });

  it("throws ConfigError when OGKIT_TRACE_DIR is unset and --dir is not passed", async () => {
    const lines: string[] = [];
    const deps = makeDeps({
      write: (l) => lines.push(l),
      tracesReader: {
        defaultTraceDir: () => null,
        listTraceFiles: async () => [],
        readTraceFile: async () => [],
        summarizeTrace: (id) => ({
          traceId: id,
          spans: 0,
          totalFeeWei: "0",
          totalGas: "0",
          topOp: null,
          ops: {},
        }),
      },
    });
    await buildProgram(deps).parseAsync(["node", "0g", "traces", "list"]);
    const out = lines.join("\n");
    expect(out).toMatch(/OBSERVABILITY_TRACE_DIR_NOT_SET/);
    expect(out).toMatch(/No trace directory configured/);
  });

  it("handles empty directory cleanly", async () => {
    const lines: string[] = [];
    const deps = makeDeps({
      write: (l) => lines.push(l),
      tracesReader: {
        defaultTraceDir: () => "/t",
        listTraceFiles: async () => [],
        readTraceFile: async () => [],
        summarizeTrace: (id) => ({
          traceId: id,
          spans: 0,
          totalFeeWei: "0",
          totalGas: "0",
          topOp: null,
          ops: {},
        }),
      },
    });
    await buildProgram(deps).parseAsync(["node", "0g", "traces", "list"]);
    expect(lines.join("\n")).toContain("No traces in /t");
  });
});

describe("0g traces inspect", () => {
  it("pretty-prints spans, op, fee, attributes (human mode)", async () => {
    const lines: string[] = [];
    const deps = makeDeps({
      write: (l) => lines.push(l),
      tracesReader: {
        defaultTraceDir: () => "/t",
        listTraceFiles: async () => [
          { path: "/t/2026-05-23-xx.jsonl", traceId: "xx", mtimeMs: 1, sizeBytes: 0 },
        ],
        readTraceFile: async () => [
          recordWith("storage.upload", "500", "xx"),
          recordWith("compute.inference", "100", "xx"),
        ],
        summarizeTrace: (id, recs) => ({
          traceId: id,
          spans: recs.length,
          totalFeeWei: "600",
          totalGas: "0",
          topOp: "storage.upload",
          ops: { "storage.upload": 1, "compute.inference": 1 },
        }),
      },
    });
    await buildProgram(deps).parseAsync(["node", "0g", "traces", "inspect", "xx"]);
    const out = lines.join("\n");
    expect(out).toContain("Trace xx");
    expect(out).toContain("0gkit.storage.upload");
    expect(out).toContain("0gkit.compute.inference");
    expect(out).toContain("feeWei=500");
    expect(out).toContain("feeWei=100");
    expect(out).toContain("Total: spans=2 feeWei=600");
  });

  it("--json emits a Jaeger-v1-shaped envelope that cost forecast accepts", async () => {
    const lines: string[] = [];
    const deps = makeDeps({
      write: (l) => lines.push(l),
      tracesReader: {
        defaultTraceDir: () => "/t",
        listTraceFiles: async () => [
          { path: "/t/2026-05-23-jj.jsonl", traceId: "jj", mtimeMs: 1, sizeBytes: 0 },
        ],
        readTraceFile: async () => [recordWith("storage.upload", "999", "jj")],
        summarizeTrace: (id) => ({
          traceId: id,
          spans: 1,
          totalFeeWei: "999",
          totalGas: "0",
          topOp: "storage.upload",
          ops: { "storage.upload": 1 },
        }),
      },
    });
    await buildProgram(deps).parseAsync([
      "node",
      "0g",
      "traces",
      "inspect",
      "jj",
      "--json",
    ]);
    const env = JSON.parse(lines.join("\n"));
    expect(env.data).toHaveLength(1);
    expect(env.data[0].traceID).toBe("jj");
    expect(env.data[0].spans).toHaveLength(1);
    const tags = env.data[0].spans[0].tags;
    const op = tags.find((t: { key: string }) => t.key === "0gkit.op");
    expect(op?.value).toBe("storage.upload");
    const fee = tags.find((t: { key: string }) => t.key === "0gkit.fee_native");
    expect(fee?.value).toBe("999");
  });

  it("renders ZeroGError when traceId is not in dir", async () => {
    const lines: string[] = [];
    const deps = makeDeps({
      write: (l) => lines.push(l),
      tracesReader: {
        defaultTraceDir: () => "/t",
        listTraceFiles: async () => [],
        readTraceFile: async () => [],
        summarizeTrace: (id) => ({
          traceId: id,
          spans: 0,
          totalFeeWei: "0",
          totalGas: "0",
          topOp: null,
          ops: {},
        }),
      },
    });
    await buildProgram(deps).parseAsync(["node", "0g", "traces", "inspect", "missing"]);
    const out = lines.join("\n");
    expect(out).toMatch(/OBSERVABILITY_TRACE_NOT_FOUND/);
    expect(out).toMatch(/Trace 'missing' not found/);
  });

  it("--dir overrides OGKIT_TRACE_DIR", async () => {
    const lines: string[] = [];
    const seenDirs: string[] = [];
    const deps = makeDeps({
      write: (l) => lines.push(l),
      tracesReader: {
        defaultTraceDir: () => "/from-env",
        listTraceFiles: async (d) => {
          seenDirs.push(d);
          return d === "/override"
            ? [
                {
                  path: "/override/2026-05-23-id.jsonl",
                  traceId: "id",
                  mtimeMs: 1,
                  sizeBytes: 0,
                },
              ]
            : [];
        },
        readTraceFile: async () => [recordWith("storage.upload", "1", "id")],
        summarizeTrace: (id) => ({
          traceId: id,
          spans: 1,
          totalFeeWei: "1",
          totalGas: "0",
          topOp: "storage.upload",
          ops: { "storage.upload": 1 },
        }),
      },
    });
    await buildProgram(deps).parseAsync([
      "node",
      "0g",
      "traces",
      "inspect",
      "id",
      "--dir",
      "/override",
    ]);
    expect(seenDirs).toContain("/override");
    expect(lines.join("\n")).toContain("Trace id");
  });

  it("surfaces OBSERVABILITY_TRACE_READ_FAILED on corrupt JSONL", async () => {
    const lines: string[] = [];
    const deps = makeDeps({
      write: (l) => lines.push(l),
      tracesReader: {
        defaultTraceDir: () => "/t",
        listTraceFiles: async () => [
          { path: "/t/2026-05-23-zz.jsonl", traceId: "zz", mtimeMs: 1, sizeBytes: 0 },
        ],
        readTraceFile: async () => {
          throw new Error("not valid JSON");
        },
        summarizeTrace: (id) => ({
          traceId: id,
          spans: 0,
          totalFeeWei: "0",
          totalGas: "0",
          topOp: null,
          ops: {},
        }),
      },
    });
    await buildProgram(deps).parseAsync(["node", "0g", "traces", "inspect", "zz"]);
    const out = lines.join("\n");
    expect(out).toMatch(/OBSERVABILITY_TRACE_READ_FAILED/);
    expect(out).toMatch(/not valid JSON/);
  });
});
