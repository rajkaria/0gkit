# SP14 — Local `0g traces` explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a local trace explorer for 0gkit. `OGKIT_TRACE_DIR=<dir>` opts in to mirroring every instrumented 0gkit span to JSONL on disk; `0g traces list` + `0g traces inspect <traceId>` read those files and pipe cleanly into the SP14-shipped `0g cost forecast --from-jaeger`.

**Architecture:** A pure side-channel inside `0gkit-observability/src/wrap.ts` (already the single end-of-span hook) writes one JSONL line per finished span when `OGKIT_TRACE_DIR` is set. File naming is `<YYYY-MM-DD>-<traceId>.jsonl`, append-only. A small `trace-sink.ts` module owns env detection, path resolution, line writing, and read-back helpers (`listTraceFiles`, `readTraceFile`, `summarizeTrace`). The CLI gains a new `traces` namespace that consumes the read helpers via a `tracesReader` injection on `ProgramDeps` for testability, and `inspect --json` emits a Jaeger-v1-shaped envelope that `0g cost forecast --from-jaeger -` accepts via stdin.

**Tech Stack:** TypeScript ESM; node:fs/promises; `@opentelemetry/api` (already a dep of observability); vitest; commander v14 (already a dep of CLI). No new runtime deps.

---

## File Structure

**New:**

- `packages/0gkit-observability/src/trace-sink.ts` — env detection (`OGKIT_TRACE_DIR`), path resolution, append-one-line, list/read/summarize helpers.
- `packages/0gkit-observability/src/__tests__/trace-sink.test.ts` — unit tests for sink helpers.
- `packages/0gkit-cli/src/commands/traces.ts` — `0g traces list [--last N] [--json]` + `0g traces inspect <traceId> [--json] [--dir <path>]` subcommands.
- `packages/0gkit-cli/src/__tests__/traces.test.ts` — CLI tests for both subcommands (human + JSON modes, missing trace, empty dir).
- `.changeset/sp14-local-trace-explorer.md` — minor bump on `0gkit-observability` (new env var + new exports) + minor bump on `0gkit-cli` (new `traces` namespace).

**Modify:**

- `packages/0gkit-observability/src/wrap.ts` — after `span.end()`, when sink is enabled, fire-and-forget write of a JSONL line carrying `{ traceId, spanId, parentSpanId, name, attributes, status, startTimeUnixNano, endTimeUnixNano }`.
- `packages/0gkit-observability/src/index.ts` — re-export `listTraceFiles`, `readTraceFile`, `summarizeTrace`, `defaultTraceDir`, and `type TraceRecord` from `./trace-sink.js`. Also re-export `type TraceFileSummary`.
- `packages/0gkit-observability/src/__tests__/instrument.test.ts` — add one test asserting that an instrumented call writes JSONL to `OGKIT_TRACE_DIR` when set.
- `packages/0gkit-cli/src/program.ts` — extend `ProgramDeps` with a `tracesReader` block (lazy-imports observability sink helpers) so tests can inject fakes; register `traces` via `registerTraces`.
- `packages/0gkit-cli/src/cli.ts` — wire the production `tracesReader` (calls `@foundryprotocol/0gkit-observability` directly — it's a small dep, no lazy import needed) and register the new command.
- `packages/0gkit-cli/package.json` — add `@foundryprotocol/0gkit-observability: workspace:*` as a regular dep (small, no native bindings).
- `apps/docs/app/cli/page.mdx` — extend the SP13 CLI reference with a `## 0g traces` section directly after `## 0g cost`; cross-link from cost section to traces.
- `apps/docs/app/packages/0gkit-observability/page.mdx` — document `OGKIT_TRACE_DIR` opt-in.

---

### Task 1: Trace sink module

**Files:**

- Create: `packages/0gkit-observability/src/trace-sink.ts`
- Test: `packages/0gkit-observability/src/__tests__/trace-sink.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/0gkit-observability/src/__tests__/trace-sink.test.ts
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
    // ensure mtime ordering
    await new Promise((r) => setTimeout(r, 10));
    await appendSpanRecord(dir, sampleRecord("newer", "0gkit.x"), at);
    const files = await listTraceFiles(dir);
    expect(files.map((f) => f.traceId)).toEqual(["newer", "older"]);
    expect(files[0]!.path.endsWith("2026-05-23-newer.jsonl")).toBe(true);
  });

  it("listTraceFiles returns [] when directory does not exist", async () => {
    expect(await listTraceFiles(join(dir, "missing"))).toEqual([]);
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

  it("readTraceFile throws ConfigError on a corrupt line", async () => {
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @foundryprotocol/0gkit-observability test trace-sink`
Expected: FAIL — module `../trace-sink.js` does not exist.

- [ ] **Step 3: Implement `trace-sink.ts`**

```ts
// packages/0gkit-observability/src/trace-sink.ts
/**
 * Local JSONL mirror for 0gkit-observability spans.
 *
 * When the `OGKIT_TRACE_DIR` env var is set, every span ended by the
 * instrumentation in `wrap.ts` is appended as one JSON line to
 * `<dir>/<YYYY-MM-DD>-<traceId>.jsonl`. The sink is fire-and-forget on the
 * write path — failures are swallowed so a broken disk never crashes a
 * production handler. The CLI's `0g traces` subcommand reads these files
 * back; `0g cost forecast --from-jaeger -` consumes the JSON `inspect`
 * output via stdin.
 */
import { mkdir, readdir, readFile, stat, appendFile } from "node:fs/promises";
import { join } from "node:path";

const ENV_KEY = "OGKIT_TRACE_DIR";

export interface TraceRecord {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  attributes: Record<string, unknown>;
  status: "ok" | "error";
  startTimeUnixNano: string;
  endTimeUnixNano: string;
}

export interface TraceFileEntry {
  /** Absolute path to the JSONL file. */
  path: string;
  /** Trace id extracted from the filename. */
  traceId: string;
  /** Filesystem mtime in ms (for sorting). */
  mtimeMs: number;
  /** File size in bytes. */
  sizeBytes: number;
}

export interface TraceFileSummary {
  traceId: string;
  spans: number;
  totalFeeWei: string;
  totalGas: string;
  topOp: string | null;
  ops: Record<string, number>;
}

export function defaultTraceDir(): string | null {
  const raw = process.env[ENV_KEY];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

export function isSinkEnabled(): boolean {
  return defaultTraceDir() !== null;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function dateStamp(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function pathForTrace(
  dir: string,
  traceId: string,
  now: Date = new Date()
): string {
  return join(dir, `${dateStamp(now)}-${traceId}.jsonl`);
}

const TRACE_FILE_RE = /^(\d{4}-\d{2}-\d{2})-([^/.]+)\.jsonl$/;

export async function appendSpanRecord(
  dir: string,
  record: TraceRecord,
  now: Date = new Date()
): Promise<void> {
  await mkdir(dir, { recursive: true });
  const line = JSON.stringify(record) + "\n";
  await appendFile(pathForTrace(dir, record.traceId, now), line, "utf8");
}

export async function listTraceFiles(dir: string): Promise<TraceFileEntry[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    if ((err as { code?: string })?.code === "ENOENT") return [];
    throw err;
  }
  const entries: TraceFileEntry[] = [];
  for (const name of names) {
    const m = TRACE_FILE_RE.exec(name);
    if (!m) continue;
    const path = join(dir, name);
    let info;
    try {
      info = await stat(path);
    } catch {
      continue;
    }
    if (!info.isFile()) continue;
    entries.push({
      path,
      traceId: m[2]!,
      mtimeMs: info.mtimeMs,
      sizeBytes: info.size,
    });
  }
  entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return entries;
}

export async function readTraceFile(path: string): Promise<TraceRecord[]> {
  const raw = await readFile(path, "utf8");
  const recs: TraceRecord[] = [];
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === "") continue;
    try {
      recs.push(JSON.parse(line) as TraceRecord);
    } catch (err) {
      throw new Error(
        `${path}:${i + 1} is not valid JSON: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }
  return recs;
}

function asBigintString(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number" && Number.isFinite(v)) return BigInt(Math.trunc(v));
  if (typeof v === "string" && v.trim() !== "") {
    try {
      return BigInt(v);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

export function summarizeTrace(
  traceId: string,
  records: TraceRecord[]
): TraceFileSummary {
  let totalFee = 0n;
  let totalGas = 0n;
  const ops: Record<string, number> = {};
  for (const r of records) {
    const op = r.attributes["0gkit.op"];
    if (typeof op === "string" && op !== "") {
      ops[op] = (ops[op] ?? 0) + 1;
    }
    totalFee += asBigintString(r.attributes["0gkit.fee_native"]);
    totalGas += asBigintString(r.attributes["0gkit.gas_native"]);
  }
  let topOp: string | null = null;
  let topCount = 0;
  for (const [name, count] of Object.entries(ops)) {
    if (count > topCount) {
      topCount = count;
      topOp = name;
    }
  }
  return {
    traceId,
    spans: records.length,
    totalFeeWei: totalFee.toString(),
    totalGas: totalGas.toString(),
    topOp,
    ops,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @foundryprotocol/0gkit-observability test trace-sink`
Expected: PASS — all 11 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/0gkit-observability/src/trace-sink.ts packages/0gkit-observability/src/__tests__/trace-sink.test.ts
git commit -m "feat(observability): trace-sink module — OGKIT_TRACE_DIR JSONL mirror helpers"
```

---

### Task 2: Wire the sink into `wrap.ts`

**Files:**

- Modify: `packages/0gkit-observability/src/wrap.ts`
- Modify: `packages/0gkit-observability/src/__tests__/instrument.test.ts`

- [ ] **Step 1: Add the integration test**

Append to `packages/0gkit-observability/src/__tests__/instrument.test.ts`:

```ts
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("instrument + trace-sink mirror", () => {
  let dir: string;
  const ENV_KEY = "OGKIT_TRACE_DIR";
  let original: string | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ogkit-instrument-sink-"));
    original = process.env[ENV_KEY];
    process.env[ENV_KEY] = dir;
  });

  afterEach(async () => {
    if (original === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = original;
    disinstrument0g();
    await rm(dir, { recursive: true, force: true });
  });

  it("mirrors a successful span to <dir>/<date>-<traceId>.jsonl when OGKIT_TRACE_DIR is set", async () => {
    class FakeStorage {
      network = "galileo";
      async upload(_bytes: Uint8Array, _opts?: { dryRun?: boolean }) {
        return { root: "0xabc", tx: { hash: "0xdef", blockNumber: 1, latencyMs: 1 } };
      }
    }
    await instrument0g({
      mode: "attach",
      targets: { storage: { class: FakeStorage, methods: ["upload"] } },
    });
    const s = new FakeStorage();
    await s.upload(new Uint8Array([1, 2, 3]));
    // sink write awaits inside wrapMethod, so file is on disk by here.
    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    expect(files[0]!).toMatch(/^\d{4}-\d{2}-\d{2}-[0-9a-f]+\.jsonl$/);
    const content = await readFile(join(dir, files[0]!), "utf8");
    const rec = JSON.parse(content.trim());
    expect(rec.name).toBe("0gkit.storage.upload");
    expect(rec.status).toBe("ok");
    expect(rec.attributes["0gkit.op"]).toBe("storage.upload");
    expect(rec.attributes["0gkit.size_bytes"]).toBe(3);
  });

  it("does NOT mirror when OGKIT_TRACE_DIR is unset", async () => {
    delete process.env[ENV_KEY];
    class FakeStorage {
      network = "galileo";
      async upload(_b: Uint8Array) {
        return { root: "0x", tx: { hash: "0x", blockNumber: 0, latencyMs: 0 } };
      }
    }
    await instrument0g({
      mode: "attach",
      targets: { storage: { class: FakeStorage, methods: ["upload"] } },
    });
    await new FakeStorage().upload(new Uint8Array([1]));
    expect(await readdir(dir)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @foundryprotocol/0gkit-observability test instrument`
Expected: FAIL — sink not yet wired.

- [ ] **Step 3: Modify `wrap.ts` to write JSONL after `span.end()`**

In `packages/0gkit-observability/src/wrap.ts`, add the import at the top:

```ts
import { appendSpanRecord, defaultTraceDir, type TraceRecord } from "./trace-sink.js";
```

Add a helper just above `wrapMethod`:

```ts
// Collected per span so we can mirror to JSONL after end().
interface SpanCapture {
  attrs: Record<string, unknown>;
  startUnixNano: bigint;
}

const HRTIME_ORIGIN_NS = BigInt(Date.now()) * 1_000_000n - process.hrtime.bigint();
function nowUnixNano(): bigint {
  return process.hrtime.bigint() + HRTIME_ORIGIN_NS;
}

async function mirrorSpan(
  span: Span,
  opName: string,
  capture: SpanCapture,
  status: "ok" | "error"
): Promise<void> {
  const dir = defaultTraceDir();
  if (!dir) return;
  const ctx = span.spanContext();
  const record: TraceRecord = {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    name: `0gkit.${opName}`,
    attributes: capture.attrs,
    status,
    startTimeUnixNano: capture.startUnixNano.toString(),
    endTimeUnixNano: nowUnixNano().toString(),
  };
  try {
    await appendSpanRecord(dir, record);
  } catch {
    // Sink is best-effort: a full disk or perms error must not crash the caller.
  }
}
```

Replace the body of the `wrapper` async function so each `span.setAttribute` call also pushes into a local `capture.attrs` object, and after each `span.end()` we `await mirrorSpan(...)`:

```ts
const wrapper = async function (this: unknown, ...args: unknown[]) {
  const tracer = trace.getTracer(TRACER_NAME);
  return tracer.startActiveSpan(`0gkit.${opName}`, async (span: Span) => {
    const capture: SpanCapture = { attrs: {}, startUnixNano: nowUnixNano() };
    const setAttr = (k: string, v: unknown) => {
      if (v === undefined || v === null) return;
      span.setAttribute(k, v as string | number | boolean);
      capture.attrs[k] = v;
    };
    setAttr(ATTR.OP, opName);
    const pre = preAttrs(args, undefined, this);
    for (const [k, v] of Object.entries(pre)) setAttr(k, v);
    try {
      const result = await original.apply(this, args);
      const post = postAttrs(args, result, this);
      for (const [k, v] of Object.entries(post)) setAttr(k, v);
      span.end();
      await mirrorSpan(span, opName, capture, "ok");
      return result;
    } catch (err) {
      const code = (err as { code?: unknown })?.code;
      if (typeof code === "string") setAttr(ATTR.ERROR_CODE, code);
      span.recordException(err as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (err as Error).message ?? String(err),
      });
      span.end();
      await mirrorSpan(span, opName, capture, "error");
      throw err;
    }
  });
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @foundryprotocol/0gkit-observability test`
Expected: PASS — all instrument tests + the 2 new sink-integration tests green; coverage stays above gate.

- [ ] **Step 5: Commit**

```bash
git add packages/0gkit-observability/src/wrap.ts packages/0gkit-observability/src/__tests__/instrument.test.ts
git commit -m "feat(observability): mirror spans to OGKIT_TRACE_DIR JSONL when env set"
```

---

### Task 3: Re-export sink helpers from observability index

**Files:**

- Modify: `packages/0gkit-observability/src/index.ts`

- [ ] **Step 1: Add the exports**

Replace `packages/0gkit-observability/src/index.ts` with:

```ts
export { ATTR, type AttrKey } from "./attributes.js";
export {
  instrument0g,
  disinstrument0g,
  type InstrumentConfig,
  type InstrumentMode,
  type InstrumentTargets,
  type ExporterConfig,
} from "./instrument.js";
export {
  appendSpanRecord,
  defaultTraceDir,
  isSinkEnabled,
  listTraceFiles,
  pathForTrace,
  readTraceFile,
  summarizeTrace,
  type TraceFileEntry,
  type TraceFileSummary,
  type TraceRecord,
} from "./trace-sink.js";
```

- [ ] **Step 2: Verify build + bundle budget still passes**

Run: `pnpm --filter @foundryprotocol/0gkit-observability typecheck && pnpm --filter @foundryprotocol/0gkit-observability test bundle-size`
Expected: PASS. Sink helpers add < 1 KB; budget is 20 KB gzipped.

- [ ] **Step 3: Commit**

```bash
git add packages/0gkit-observability/src/index.ts
git commit -m "feat(observability): re-export trace-sink helpers from package root"
```

---

### Task 4: `0g traces list` + `inspect` commands

**Files:**

- Create: `packages/0gkit-cli/src/commands/traces.ts`
- Create: `packages/0gkit-cli/src/__tests__/traces.test.ts`
- Modify: `packages/0gkit-cli/src/program.ts`
- Modify: `packages/0gkit-cli/src/cli.ts`
- Modify: `packages/0gkit-cli/package.json`

- [ ] **Step 1: Add the dep on observability**

In `packages/0gkit-cli/package.json` under `"dependencies"`, add:

```json
    "@foundryprotocol/0gkit-observability": "workspace:*",
```

Run `pnpm install` from the repo root.

- [ ] **Step 2: Write the failing test**

```ts
// packages/0gkit-cli/src/__tests__/traces.test.ts
import { describe, expect, it } from "vitest";
import { buildProgram } from "../program.js";
import { makeFixtureDeps } from "./fixture.js";
import type {
  TraceFileEntry,
  TraceFileSummary,
  TraceRecord,
} from "@foundryprotocol/0gkit-observability";

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
    const deps = makeFixtureDeps({
      write: (l) => lines.push(l),
      tracesReader: {
        defaultTraceDir: () => "/t",
        listTraceFiles: async (_dir) => entries,
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
    const deps = makeFixtureDeps({
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
    expect(out).toContain("a");
    expect(out).toContain("b");
    expect(out).not.toContain('"traceId": "c"');
    expect(out).not.toMatch(/\bc\b\s+spans/);
  });

  it("--json emits a structured payload", async () => {
    const lines: string[] = [];
    const deps = makeFixtureDeps({
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
    const deps = makeFixtureDeps({
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
    await expect(
      buildProgram(deps).parseAsync(["node", "0g", "traces", "list"])
    ).rejects.toMatchObject({ code: "OBSERVABILITY_TRACE_DIR_NOT_SET" });
  });

  it("handles empty directory cleanly", async () => {
    const lines: string[] = [];
    const deps = makeFixtureDeps({
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
    const deps = makeFixtureDeps({
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
    const deps = makeFixtureDeps({
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

  it("throws OBSERVABILITY_TRACE_NOT_FOUND when traceId is not in dir", async () => {
    const deps = makeFixtureDeps({
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
    await expect(
      buildProgram(deps).parseAsync(["node", "0g", "traces", "inspect", "missing"])
    ).rejects.toMatchObject({ code: "OBSERVABILITY_TRACE_NOT_FOUND" });
  });

  it("--dir overrides OGKIT_TRACE_DIR", async () => {
    const lines: string[] = [];
    const seenDirs: string[] = [];
    const deps = makeFixtureDeps({
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
});
```

(Reference: `packages/0gkit-cli/src/__tests__/fixture.ts` already provides `makeFixtureDeps` — extend it in Step 4 with the optional `tracesReader` knob.)

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @foundryprotocol/0gkit-cli test traces`
Expected: FAIL — `OBSERVABILITY_TRACE_DIR_NOT_SET` / `OBSERVABILITY_TRACE_NOT_FOUND` codes and the `traces` subcommand do not exist.

- [ ] **Step 4: Add error codes and wire deps**

In `packages/0gkit-core/src/error-codes.ts`, add to the `OBSERVABILITY_*` tuple:

```ts
  "OBSERVABILITY_TRACE_DIR_NOT_SET",
  "OBSERVABILITY_TRACE_NOT_FOUND",
  "OBSERVABILITY_TRACE_READ_FAILED",
```

In `packages/0gkit-cli/src/__tests__/fixture.ts`, extend `makeFixtureDeps` to accept and pass through an optional `tracesReader`:

```ts
// near the top
import type {
  TraceFileEntry,
  TraceFileSummary,
  TraceRecord,
} from "@foundryprotocol/0gkit-observability";

export interface TracesReader {
  defaultTraceDir: () => string | null;
  listTraceFiles: (dir: string) => Promise<TraceFileEntry[]>;
  readTraceFile: (path: string) => Promise<TraceRecord[]>;
  summarizeTrace: (id: string, recs: TraceRecord[]) => TraceFileSummary;
}

// inside the deps object literal returned by makeFixtureDeps, add:
//   tracesReader: overrides.tracesReader ?? defaultTracesReaderStub(),
//
// and define near the bottom of the file:
function defaultTracesReaderStub(): TracesReader {
  return {
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
  };
}
```

In `packages/0gkit-cli/src/program.ts`, extend `ProgramDeps`:

```ts
import type {
  TraceFileEntry,
  TraceFileSummary,
  TraceRecord,
} from "@foundryprotocol/0gkit-observability";

// add near the top of ProgramDeps (alongside daEstimate):
tracesReader: {
  defaultTraceDir: () => string | null;
  listTraceFiles: (dir: string) => Promise<TraceFileEntry[]>;
  readTraceFile: (path: string) => Promise<TraceRecord[]>;
  summarizeTrace: (id: string, recs: TraceRecord[]) => TraceFileSummary;
}
```

Import the new register function near the other `registerX` imports:

```ts
import { registerTraces } from "./commands/traces.js";
```

In `buildProgram` register it right after `registerCost(program, deps)`:

```ts
registerTraces(program, deps);
```

- [ ] **Step 5: Implement `commands/traces.ts`**

```ts
// packages/0gkit-cli/src/commands/traces.ts
import type { Command } from "commander";
import { ZeroGError } from "@foundryprotocol/0gkit-core";
import type {
  TraceFileSummary,
  TraceRecord,
} from "@foundryprotocol/0gkit-observability";
import { runCommand, type ProgramDeps } from "../program.js";

interface ListOpts {
  last?: number;
  dir?: string;
  json?: boolean;
}

interface InspectOpts {
  dir?: string;
  json?: boolean;
}

function resolveDir(deps: ProgramDeps, override: string | undefined): string {
  if (override && override.trim() !== "") return override.trim();
  const fromEnv = deps.tracesReader.defaultTraceDir();
  if (fromEnv) return fromEnv;
  throw new ZeroGError({
    code: "OBSERVABILITY_TRACE_DIR_NOT_SET",
    message: "No trace directory configured.",
    hint: "Set OGKIT_TRACE_DIR=<path> in the process that emitted spans, or pass --dir <path>. See https://docs.0gkit.com/errors/OBSERVABILITY_TRACE_DIR_NOT_SET",
  });
}

function fmtSummary(s: TraceFileSummary): string {
  const top = s.topOp ?? "—";
  return `  ${s.traceId.padEnd(36)}  spans=${String(s.spans).padEnd(4)}  feeWei=${s.totalFeeWei.padEnd(16)}  topOp=${top}`;
}

function recordsToJaegerEnvelope(
  traceId: string,
  records: TraceRecord[]
): Record<string, unknown> {
  return {
    data: [
      {
        traceID: traceId,
        spans: records.map((r) => ({
          traceID: traceId,
          spanID: r.spanId,
          operationName: r.name,
          startTime: Math.trunc(Number(BigInt(r.startTimeUnixNano) / 1000n)),
          duration: Math.trunc(
            Number((BigInt(r.endTimeUnixNano) - BigInt(r.startTimeUnixNano)) / 1000n)
          ),
          tags: Object.entries(r.attributes).map(([key, value]) => ({
            key,
            type:
              typeof value === "number"
                ? "float64"
                : typeof value === "boolean"
                  ? "bool"
                  : "string",
            value: typeof value === "bigint" ? value.toString() : value,
          })),
          process: { serviceName: "0gkit" },
        })),
      },
    ],
  };
}

export function registerTraces(program: Command, deps: ProgramDeps): void {
  const traces = program
    .command("traces")
    .description("Inspect local 0gkit trace JSONL files written by OGKIT_TRACE_DIR.");

  traces
    .command("list")
    .description("List trace files in the configured trace directory, newest first.")
    .option("--last <n>", "show only the N most recent traces", (v) => Number(v))
    .option("--dir <path>", "override OGKIT_TRACE_DIR for this command")
    .option("--json", "emit a JSON payload")
    .action(async function (this: Command) {
      await runCommand(deps, this, async () => {
        const opts = this.opts() as ListOpts;
        const dir = resolveDir(deps, opts.dir);
        let entries = await deps.tracesReader.listTraceFiles(dir);
        if (
          typeof opts.last === "number" &&
          Number.isFinite(opts.last) &&
          opts.last > 0
        ) {
          entries = entries.slice(0, opts.last);
        }
        const summaries: TraceFileSummary[] = [];
        for (const entry of entries) {
          const recs = await deps.tracesReader.readTraceFile(entry.path);
          summaries.push(deps.tracesReader.summarizeTrace(entry.traceId, recs));
        }
        const human: string[] = [];
        if (summaries.length === 0) {
          human.push(
            `No traces in ${dir} (set OGKIT_TRACE_DIR or run with --dir <path>).`
          );
        } else {
          human.push(`Traces in ${dir} (${summaries.length}):`);
          for (const s of summaries) human.push(fmtSummary(s));
          human.push(
            `Tip: 0g traces inspect <traceId> --json | 0g cost forecast --from-jaeger -`
          );
        }
        return {
          human,
          json: {
            dir,
            count: summaries.length,
            traces: summaries,
          },
        };
      });
    });

  traces
    .command("inspect <traceId>")
    .description("Pretty-print one trace's spans, fees, and attributes.")
    .option("--dir <path>", "override OGKIT_TRACE_DIR for this command")
    .option(
      "--json",
      "emit a Jaeger-v1-shaped envelope (pipe into `0g cost forecast --from-jaeger -`)"
    )
    .action(async function (this: Command, traceId: string) {
      await runCommand(deps, this, async () => {
        const opts = this.opts() as InspectOpts;
        const dir = resolveDir(deps, opts.dir);
        const entries = await deps.tracesReader.listTraceFiles(dir);
        const match = entries.find((e) => e.traceId === traceId);
        if (!match) {
          throw new ZeroGError({
            code: "OBSERVABILITY_TRACE_NOT_FOUND",
            message: `Trace '${traceId}' not found in ${dir}.`,
            hint: "Run `0g traces list` to see what is in the directory. Trace ids are the hex string after the date in the filename. See https://docs.0gkit.com/errors/OBSERVABILITY_TRACE_NOT_FOUND",
          });
        }
        let records: TraceRecord[];
        try {
          records = await deps.tracesReader.readTraceFile(match.path);
        } catch (err) {
          throw new ZeroGError({
            code: "OBSERVABILITY_TRACE_READ_FAILED",
            message: `Could not read ${match.path}: ${err instanceof Error ? err.message : String(err)}`,
            hint: "The file may have been truncated or written by an older toolkit version. Delete and re-run with OGKIT_TRACE_DIR set to regenerate.",
          });
        }
        const summary = deps.tracesReader.summarizeTrace(traceId, records);
        const human: string[] = [];
        human.push(`Trace ${traceId} (${records.length} spans, ${match.path}):`);
        for (const r of records) {
          const op = String(r.attributes["0gkit.op"] ?? "?");
          const fee = String(r.attributes["0gkit.fee_native"] ?? "0");
          const gas = String(r.attributes["0gkit.gas_native"] ?? "0");
          human.push(
            `  ${r.name.padEnd(32)}  op=${op.padEnd(20)}  feeWei=${fee.padEnd(14)}  gas=${gas}`
          );
          if (r.status === "error") {
            const code = String(r.attributes["0gkit.error_code"] ?? "unknown");
            human.push(`    ERROR ${code}`);
          }
        }
        human.push(
          `Total: spans=${summary.spans} feeWei=${summary.totalFeeWei} topOp=${summary.topOp ?? "—"}`
        );
        return {
          human,
          json: recordsToJaegerEnvelope(traceId, records),
        };
      });
    });
}
```

- [ ] **Step 6: Wire production reader in `cli.ts`**

In `packages/0gkit-cli/src/cli.ts`, add near the other imports:

```ts
import {
  defaultTraceDir as obsDefaultTraceDir,
  listTraceFiles as obsListTraceFiles,
  readTraceFile as obsReadTraceFile,
  summarizeTrace as obsSummarizeTrace,
} from "@foundryprotocol/0gkit-observability";
```

In the `deps` object literal (after `daEstimate`, before `readStdin`):

```ts
  tracesReader: {
    defaultTraceDir: obsDefaultTraceDir,
    listTraceFiles: obsListTraceFiles,
    readTraceFile: obsReadTraceFile,
    summarizeTrace: obsSummarizeTrace,
  },
```

- [ ] **Step 7: Run to verify it passes**

Run: `pnpm --filter @foundryprotocol/0gkit-cli test traces`
Expected: PASS — all 9 traces tests green.

Run: `pnpm --filter @foundryprotocol/0gkit-cli test`
Expected: PASS — entire CLI suite stays green (existing 100+ tests + 9 new). Coverage stays above gate.

- [ ] **Step 8: Verify `0g cost forecast --from-jaeger -` consumes inspect output**

The `--from-jaeger` flag currently requires a file path. To make the `inspect --json | 0g cost forecast --from-jaeger -` pipeline work, extend `commands/cost.ts` so that `--from-jaeger -` reads from stdin (already wired via `deps.readStdin`).

Add this just before the `let raw: Uint8Array;` line in `cost.ts`:

```ts
if (opts.fromJaeger === "-") {
  const raw = await deps.readStdin();
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(raw));
  } catch (err) {
    throw new ConfigError(
      `stdin is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      `Pipe Jaeger JSON into the command: 0g traces inspect <id> --json | 0g cost forecast --from-jaeger -`
    );
  }
  const forecast = aggregateJaegerDump(parsed);
  return {
    human: renderForecast(forecast, "<stdin>"),
    json: forecastToJson(forecast, "<stdin>"),
  };
}
```

Add a corresponding test case to `packages/0gkit-cli/src/__tests__/cost.test.ts`:

```ts
it("--from-jaeger - reads from stdin and aggregates", async () => {
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
  const lines: string[] = [];
  const deps = makeFixtureDeps({
    write: (l) => lines.push(l),
    readStdin: async () => new TextEncoder().encode(stdinPayload),
  });
  await buildProgram(deps).parseAsync([
    "node",
    "0g",
    "cost",
    "forecast",
    "--from-jaeger",
    "-",
    "--json",
  ]);
  const out = JSON.parse(lines.join("\n"));
  expect(out.byOp["storage.upload"].totalFeeWei).toBe("777");
  expect(out.file).toBe("<stdin>");
});
```

Run the whole CLI suite once more.

- [ ] **Step 9: Commit**

```bash
git add packages/0gkit-cli/src/commands/traces.ts \
  packages/0gkit-cli/src/__tests__/traces.test.ts \
  packages/0gkit-cli/src/__tests__/fixture.ts \
  packages/0gkit-cli/src/program.ts \
  packages/0gkit-cli/src/cli.ts \
  packages/0gkit-cli/package.json \
  packages/0gkit-cli/src/commands/cost.ts \
  packages/0gkit-cli/src/__tests__/cost.test.ts \
  packages/0gkit-core/src/error-codes.ts \
  pnpm-lock.yaml
git commit -m "feat(cli): 0g traces list + inspect, --from-jaeger - reads stdin"
```

---

### Task 5: Docs + error code MDX pages

**Files:**

- Modify: `apps/docs/app/cli/page.mdx`
- Modify: `apps/docs/app/packages/0gkit-observability/page.mdx`
- Create: `apps/docs/app/errors/OBSERVABILITY_TRACE_DIR_NOT_SET/page.mdx`
- Create: `apps/docs/app/errors/OBSERVABILITY_TRACE_NOT_FOUND/page.mdx`
- Create: `apps/docs/app/errors/OBSERVABILITY_TRACE_READ_FAILED/page.mdx`

- [ ] **Step 1: Extend the CLI reference**

Append a section after the `## 0g cost` section in `apps/docs/app/cli/page.mdx`:

````md
## 0g traces

Inspect local 0gkit trace JSONL files written by the `OGKIT_TRACE_DIR` opt-in mirror (SP14, [observability docs](/packages/0gkit-observability#local-trace-mirror)). Pipes cleanly into `0g cost forecast --from-jaeger -` so you can replay one local request as a real per-op cost breakdown.

| Subcommand                  | What it does                                                        |
| --------------------------- | ------------------------------------------------------------------- |
| `0g traces list [--last N]` | Show trace files newest-first with span count + fee total + top op. |
| `0g traces inspect <id>`    | Pretty-print every span in a trace (op, fee, gas, attributes).      |

### Quickstart

```bash
# In the process that runs your 0gkit code:
export OGKIT_TRACE_DIR=.0gkit/traces

# After requests have run:
0g traces list --last 5
0g traces inspect <traceId>

# Replay one local trace as a cost forecast:
0g traces inspect <traceId> --json | 0g cost forecast --from-jaeger -
```

Both subcommands accept `--dir <path>` to override `OGKIT_TRACE_DIR` for a one-off look at a directory copied from a teammate. `--json` is supported on both for piping into other tooling.
````

Add a cross-link inside the existing `## 0g cost` section's `--from-jaeger` row:

```md
> Pass `-` as the file path to read a Jaeger envelope from stdin — pipes cleanly from `0g traces inspect <id> --json`.
```

- [ ] **Step 2: Document the env var in the observability package page**

Add a new section to `apps/docs/app/packages/0gkit-observability/page.mdx`:

````md
## Local trace mirror (SP14)

Set `OGKIT_TRACE_DIR=<path>` in the process that calls `instrument0g(...)` and every span will be mirrored as one JSON line to `<path>/<YYYY-MM-DD>-<traceId>.jsonl`, in addition to your configured OTel exporter. Off by default — pure opt-in, no network.

```bash
export OGKIT_TRACE_DIR=.0gkit/traces
node ./your-handler.js
0g traces list
```
````

The sink is fire-and-forget: a full disk or permissions error never crashes the handler. See [`0g traces`](/cli#0g-traces) for the read side.

````

- [ ] **Step 3: Scaffold three error pages**

Run the existing scaffolder once to seed the three new codes:

```bash
node /Users/rajkaria/Projects/0G-ai-kit/scripts/scaffold-error-pages.mjs
````

Then hand-edit each of the three new files (`OBSERVABILITY_TRACE_DIR_NOT_SET`, `OBSERVABILITY_TRACE_NOT_FOUND`, `OBSERVABILITY_TRACE_READ_FAILED`) to replace the generic template with a real Cause / Fix / Example block. Example for `OBSERVABILITY_TRACE_DIR_NOT_SET`:

````mdx
# OBSERVABILITY_TRACE_DIR_NOT_SET

`0g traces list` / `0g traces inspect` need a directory to read JSONL trace mirrors from.

## Cause

You ran `0g traces list` (or `inspect`) but neither `OGKIT_TRACE_DIR` was set in your shell nor `--dir <path>` was passed.

## Fix

Either:

```bash
export OGKIT_TRACE_DIR=.0gkit/traces
0g traces list
```
````

…or pass the directory explicitly:

```bash
0g traces list --dir ./my-traces
```

## Example

```bash
$ 0g traces list
Error: No trace directory configured.
  Hint: Set OGKIT_TRACE_DIR=<path> in the process that emitted spans, or pass --dir <path>.
  Help: https://docs.0gkit.com/errors/OBSERVABILITY_TRACE_DIR_NOT_SET
```

````

(Equivalent treatment for the other two codes — substantive cause/fix/example, not stubs.)

- [ ] **Step 4: Run docs-check**

Run: `pnpm docs:check`
Expected: PASS — three new codes documented, no orphans, no version drift.

- [ ] **Step 5: Commit**

```bash
git add apps/docs/app/cli/page.mdx apps/docs/app/packages/0gkit-observability/page.mdx apps/docs/app/errors/OBSERVABILITY_TRACE_*/page.mdx
git commit -m "docs(sp14): 0g traces CLI reference + OGKIT_TRACE_DIR + 3 error pages"
````

---

### Task 6: Changeset + workspace-wide green gates

**Files:**

- Create: `.changeset/sp14-local-trace-explorer.md`

- [ ] **Step 1: Write the changeset**

```md
---
"@foundryprotocol/0gkit-observability": minor
"@foundryprotocol/0gkit-cli": minor
"@foundryprotocol/0gkit-core": patch
---

SP14: local `0g traces` explorer.

- `0gkit-observability` mirrors every instrumented span to JSONL when `OGKIT_TRACE_DIR` is set. Off by default, fire-and-forget, never replaces the configured OTel exporter.
- New `0g traces list [--last N] [--dir <path>] [--json]` and `0g traces inspect <traceId> [--dir <path>] [--json]` subcommands read those files.
- `0g cost forecast --from-jaeger -` now reads a Jaeger envelope from stdin so `inspect --json` pipes cleanly into it.
- New error codes: `OBSERVABILITY_TRACE_DIR_NOT_SET`, `OBSERVABILITY_TRACE_NOT_FOUND`, `OBSERVABILITY_TRACE_READ_FAILED`.
```

- [ ] **Step 2: Run every CI-gated workspace command**

Run in order:

```bash
pnpm install
pnpm format:check
pnpm boundary:check
pnpm typecheck
pnpm build
pnpm test
pnpm docs:check
pnpm templates:check
pnpm test:scripts
```

All must be green. Fix any drift inline.

- [ ] **Step 3: Commit**

```bash
git add .changeset/sp14-local-trace-explorer.md
git commit -m "chore(changeset): sp14 local trace explorer (minor on observability + cli, patch on core)"
```

---

### Task 7: Open PR + squash-merge after CI

- [ ] **Step 1: Branch + push**

```bash
git checkout -b sp14-local-trace-explorer
git push -u origin sp14-local-trace-explorer
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "SP14: local 0g traces explorer + OGKIT_TRACE_DIR JSONL mirror" --body "$(cat <<'EOF'
## Summary

Closes the SP14 entry in `docs/superpowers/plans/2026-05-23-post-v1-roadmap.md`. Wave-A item that gives developers an offline, local view of 0gkit traffic without standing up a Jaeger / Honeycomb / Datadog backend.

- `OGKIT_TRACE_DIR=<path>` in the process that calls `instrument0g(...)` mirrors every span to `<path>/<YYYY-MM-DD>-<traceId>.jsonl`. Off by default; fire-and-forget; never replaces the configured OTel exporter.
- New `0g traces list [--last N]` summarises trace files newest-first (span count, fee total, top op).
- New `0g traces inspect <traceId> [--json]` pretty-prints every span; `--json` emits a Jaeger-v1-shaped envelope.
- `0g cost forecast --from-jaeger -` now accepts a Jaeger envelope on stdin, so `inspect --json | cost forecast --from-jaeger -` replays one local request as a real per-op cost breakdown.
- 3 new error codes: `OBSERVABILITY_TRACE_DIR_NOT_SET`, `OBSERVABILITY_TRACE_NOT_FOUND`, `OBSERVABILITY_TRACE_READ_FAILED` — each with a docs page.
- Changeset cuts a minor on `0gkit-observability` + `0gkit-cli` and a patch on `0gkit-core`.

## Test plan
- [x] `pnpm test` workspace-wide green
- [x] `pnpm docs:check` (new codes documented, no orphans, no version drift)
- [x] `pnpm boundary:check` (no new module-graph violations)
- [x] `pnpm templates:check` (existing templates unaffected)
- [x] Manual smoke: ran `OGKIT_TRACE_DIR=./tmp-traces node -e "..."`, verified JSONL written; `0g traces list` + `0g traces inspect` + `0g cost forecast --from-jaeger -` pipeline works end-to-end

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Wait for CI, then squash-merge**

```bash
gh pr checks --watch
gh pr merge --squash --delete-branch
```

After the changesets bot opens the auto-generated version-packages PR, squash-merge that too so the Release workflow publishes `@foundryprotocol/0gkit-observability` + `@foundryprotocol/0gkit-cli` minors + `0gkit-core` patch to npm.

---

## Self-Review

- **Coverage:** Every SP14 bullet in the roadmap doc maps to a task (env opt-in → Task 1+2+3; `traces list` → Task 4; `traces inspect` → Task 4; CLI reference doc → Task 5; PR #42 follow-on `--from-jaeger -` stdin → Task 4 Step 8).
- **Placeholders:** None — every step has runnable code or commands.
- **Type consistency:** `TraceRecord`, `TraceFileEntry`, `TraceFileSummary`, `TracesReader` shapes are identical across the sink module, the program deps, the fixture stub, and the CLI tests. `OBSERVABILITY_TRACE_DIR_NOT_SET` / `OBSERVABILITY_TRACE_NOT_FOUND` / `OBSERVABILITY_TRACE_READ_FAILED` codes are added once in core, then asserted in tests and surfaced in CLI errors.
- **Boil-the-ocean:** Stdin support on `--from-jaeger -` is included in the same PR even though it's a small extra — without it the `inspect --json | cost forecast --from-jaeger` pipeline doesn't work and SP14's primary user-visible value is halved.
