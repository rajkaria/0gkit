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
