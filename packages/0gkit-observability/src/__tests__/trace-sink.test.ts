import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendSpanRecord,
  defaultTraceDir,
  isSinkEnabled,
  listTraceFiles,
  pathForTrace,
  readTraceFile,
  summarizeTrace,
  type TraceRecord,
} from "../trace-sink.js";

const ENV_KEY = "OGKIT_TRACE_DIR";

describe("trace-sink env + path", () => {
  const original = process.env[ENV_KEY];
  afterEach(() => {
    if (original === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = original;
  });

  it("isSinkEnabled is false when OGKIT_TRACE_DIR is unset", () => {
    delete process.env[ENV_KEY];
    expect(isSinkEnabled()).toBe(false);
    expect(defaultTraceDir()).toBeNull();
  });

  it("isSinkEnabled is false when OGKIT_TRACE_DIR is empty / whitespace", () => {
    process.env[ENV_KEY] = "   ";
    expect(isSinkEnabled()).toBe(false);
    expect(defaultTraceDir()).toBeNull();
  });

  it("defaultTraceDir returns the trimmed env value when set", () => {
    process.env[ENV_KEY] = "  /tmp/traces  ";
    expect(defaultTraceDir()).toBe("/tmp/traces");
    expect(isSinkEnabled()).toBe(true);
  });

  it("pathForTrace formats as <YYYY-MM-DD>-<traceId>.jsonl", () => {
    const p = pathForTrace("/tmp/traces", "abc123", new Date("2026-05-23T10:00:00Z"));
    expect(p).toBe("/tmp/traces/2026-05-23-abc123.jsonl");
  });
});

describe("trace-sink write + read roundtrip", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ogkit-trace-sink-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const sampleRecord = (traceId: string, name: string): TraceRecord => ({
    traceId,
    spanId: "span-1",
    parentSpanId: undefined,
    name,
    attributes: { "0gkit.op": "storage.upload", "0gkit.size_bytes": 1024 },
    status: "ok",
    startTimeUnixNano: "1700000000000000000",
    endTimeUnixNano: "1700000000050000000",
  });

  it("appendSpanRecord creates the file + parent dir on first write", async () => {
    const rec = sampleRecord("trace-A", "0gkit.storage.upload");
    await appendSpanRecord(dir, rec, new Date("2026-05-23T00:00:00Z"));
    const files = await readdir(dir);
    expect(files).toEqual(["2026-05-23-trace-A.jsonl"]);
    const content = await readFile(join(dir, files[0]!), "utf8");
    expect(content.endsWith("\n")).toBe(true);
    expect(JSON.parse(content.trim())).toMatchObject({
      traceId: "trace-A",
      spanId: "span-1",
      name: "0gkit.storage.upload",
      attributes: { "0gkit.op": "storage.upload", "0gkit.size_bytes": 1024 },
      status: "ok",
    });
  });

  it("appendSpanRecord appends a second span to the same trace file", async () => {
    const at = new Date("2026-05-23T00:00:00Z");
    await appendSpanRecord(dir, sampleRecord("trace-B", "0gkit.storage.upload"), at);
    await appendSpanRecord(
      dir,
      { ...sampleRecord("trace-B", "0gkit.compute.inference"), spanId: "span-2" },
      at
    );
    const lines = (await readFile(join(dir, "2026-05-23-trace-B.jsonl"), "utf8"))
      .split("\n")
      .filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).name).toBe("0gkit.storage.upload");
    expect(JSON.parse(lines[1]!).name).toBe("0gkit.compute.inference");
  });

  it("listTraceFiles returns descending by mtime and parses trace-id from filename", async () => {
    const at = new Date("2026-05-23T00:00:00Z");
    await appendSpanRecord(dir, sampleRecord("older", "0gkit.x"), at);
    await new Promise((r) => setTimeout(r, 20));
    await appendSpanRecord(dir, sampleRecord("newer", "0gkit.x"), at);
    const files = await listTraceFiles(dir);
    expect(files.map((f) => f.traceId)).toEqual(["newer", "older"]);
    expect(files[0]!.path.endsWith("2026-05-23-newer.jsonl")).toBe(true);
  });

  it("listTraceFiles returns [] when directory does not exist", async () => {
    expect(await listTraceFiles(join(dir, "missing"))).toEqual([]);
  });

  it("listTraceFiles ignores non-matching filenames", async () => {
    await writeFile(join(dir, "README.md"), "hi");
    await writeFile(
      join(dir, "2026-05-23-good.jsonl"),
      JSON.stringify(sampleRecord("good", "x")) + "\n"
    );
    const files = await listTraceFiles(dir);
    expect(files.map((f) => f.traceId)).toEqual(["good"]);
  });

  it("readTraceFile parses each JSONL line and tolerates blank lines", async () => {
    const f = join(dir, "2026-05-23-tt.jsonl");
    await writeFile(
      f,
      JSON.stringify(sampleRecord("tt", "a")) +
        "\n\n" +
        JSON.stringify(sampleRecord("tt", "b")) +
        "\n"
    );
    const recs = await readTraceFile(f);
    expect(recs.map((r) => r.name)).toEqual(["a", "b"]);
  });

  it("readTraceFile throws on a corrupt line", async () => {
    const f = join(dir, "2026-05-23-bad.jsonl");
    await writeFile(f, "{not json\n");
    await expect(readTraceFile(f)).rejects.toThrow(/not valid JSON/i);
  });

  it("summarizeTrace counts spans, sums fee, finds top op", () => {
    const recs: TraceRecord[] = [
      {
        ...sampleRecord("s", "0gkit.storage.upload"),
        attributes: {
          "0gkit.op": "storage.upload",
          "0gkit.fee_native": "100",
        },
      },
      {
        ...sampleRecord("s", "0gkit.storage.upload"),
        spanId: "span-2",
        attributes: {
          "0gkit.op": "storage.upload",
          "0gkit.fee_native": "200",
        },
      },
      {
        ...sampleRecord("s", "0gkit.compute.inference"),
        spanId: "span-3",
        attributes: {
          "0gkit.op": "compute.inference",
          "0gkit.fee_native": "50",
        },
      },
    ];
    const sum = summarizeTrace("s", recs);
    expect(sum.traceId).toBe("s");
    expect(sum.spans).toBe(3);
    expect(sum.totalFeeWei).toBe("350");
    expect(sum.topOp).toBe("storage.upload");
    expect(sum.ops).toEqual({
      "storage.upload": 2,
      "compute.inference": 1,
    });
  });

  it("summarizeTrace returns null topOp + 0 totals for empty records", () => {
    const sum = summarizeTrace("e", []);
    expect(sum.spans).toBe(0);
    expect(sum.topOp).toBeNull();
    expect(sum.totalFeeWei).toBe("0");
    expect(sum.totalGas).toBe("0");
    expect(sum.ops).toEqual({});
  });

  it("summarizeTrace tolerates numeric and bigint fee values", () => {
    const recs: TraceRecord[] = [
      {
        ...sampleRecord("n", "0gkit.x"),
        attributes: { "0gkit.op": "x", "0gkit.fee_native": 42 },
      },
      {
        ...sampleRecord("n", "0gkit.x"),
        spanId: "span-2",
        attributes: { "0gkit.op": "x", "0gkit.fee_native": "garbage" },
      },
    ];
    expect(summarizeTrace("n", recs).totalFeeWei).toBe("42");
  });
});
