/**
 * Jaeger trace parser + per-op cost aggregator for `0g cost forecast --from-jaeger`.
 *
 * Reads a Jaeger v1 JSON trace dump (the format produced by Jaeger's UI export
 * and the `/api/traces` query endpoint), filters for spans carrying the
 * `0gkit.*` semantic-attribute namespace emitted by `@foundryprotocol/0gkit-observability`
 * (SP11, see ATTR const), and aggregates real per-op gas + fee totals.
 *
 * Spans flagged `0gkit.dry_run=true` or carrying a `0gkit.error_code` are
 * counted under `spansSkipped` and excluded from cost totals — they did not
 * spend on-chain resources.
 *
 * Output shape is intentionally different from the on-the-fly forecast: real
 * traces carry per-op counts and concrete op names (`storage.upload`,
 * `compute.inference`, `da.publish`, etc.), so we surface those directly.
 */

import { ConfigError } from "@foundryprotocol/0gkit-core";

/** Subset of the Jaeger v1 span shape we care about. */
interface JaegerTag {
  key: string;
  type?: string;
  value: string | number | boolean;
}
interface JaegerSpan {
  operationName?: string;
  tags?: JaegerTag[];
  process?: { serviceName?: string };
}
interface JaegerTrace {
  traceID?: string;
  spans?: JaegerSpan[];
}
interface JaegerDump {
  data?: JaegerTrace[];
}

export interface OpAggregate {
  count: number;
  totalGas: bigint;
  totalFeeWei: bigint;
  totalSizeBytes?: number;
  totalSegments?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
}

export interface JaegerForecast {
  spansScanned: number;
  spansAttributed: number;
  spansSkipped: number;
  byOp: Record<string, OpAggregate>;
  totalGas: bigint;
  totalFeeWei: bigint;
}

const OP_KEY = "0gkit.op";
const FEE_KEY = "0gkit.fee_native";
const GAS_KEY = "0gkit.gas_native";
const SIZE_KEY = "0gkit.size_bytes";
const SEGMENTS_KEY = "0gkit.segments";
const INPUT_TOKENS_KEY = "0gkit.input_tokens";
const OUTPUT_TOKENS_KEY = "0gkit.output_tokens";
const ERROR_KEY = "0gkit.error_code";
const DRY_RUN_KEY = "0gkit.dry_run";

function tagMap(span: JaegerSpan): Map<string, JaegerTag["value"]> {
  const m = new Map<string, JaegerTag["value"]>();
  if (Array.isArray(span.tags)) {
    for (const t of span.tags) {
      if (t && typeof t.key === "string") m.set(t.key, t.value);
    }
  }
  return m;
}

function asBigint(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number" && Number.isFinite(v)) return BigInt(Math.trunc(v));
  if (typeof v === "string" && v.trim() !== "") {
    const stripped = v.startsWith("0x") || v.startsWith("0X") ? v : v;
    try {
      return BigInt(stripped);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function asNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v === "bigint") return Number(v);
  return 0;
}

function isTruthyBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true";
  return false;
}

/**
 * Parse a Jaeger v1 trace dump and aggregate 0gkit.* spans into per-op
 * gas + fee totals. Pure function — accepts already-parsed JSON.
 */
export function aggregateJaegerDump(parsed: unknown): JaegerForecast {
  const dump = parsed as JaegerDump | null;
  if (!dump || typeof dump !== "object") {
    throw new ConfigError(
      "Jaeger trace JSON is not an object.",
      "Pass a file produced by Jaeger's UI export or /api/traces — it must have a top-level `data` array."
    );
  }
  if (!Array.isArray(dump.data)) {
    throw new ConfigError(
      "Jaeger trace JSON has no `data` array.",
      "The file does not look like a Jaeger trace dump. Expected `{ data: [{ spans: [...] }] }`."
    );
  }

  let scanned = 0;
  let attributed = 0;
  let skipped = 0;
  const byOp = new Map<string, OpAggregate>();
  let totalGas = 0n;
  let totalFee = 0n;

  for (const trace of dump.data) {
    if (!trace || !Array.isArray(trace.spans)) continue;
    for (const span of trace.spans) {
      scanned++;
      const tags = tagMap(span);
      const op = tags.get(OP_KEY);
      if (typeof op !== "string" || op === "") continue;
      attributed++;
      if (isTruthyBool(tags.get(DRY_RUN_KEY)) || tags.has(ERROR_KEY)) {
        skipped++;
        continue;
      }
      const agg = byOp.get(op) ?? { count: 0, totalGas: 0n, totalFeeWei: 0n };
      agg.count++;
      const fee = asBigint(tags.get(FEE_KEY));
      const gas = asBigint(tags.get(GAS_KEY));
      agg.totalFeeWei += fee;
      agg.totalGas += gas;
      if (tags.has(SIZE_KEY)) {
        agg.totalSizeBytes = (agg.totalSizeBytes ?? 0) + asNumber(tags.get(SIZE_KEY));
      }
      if (tags.has(SEGMENTS_KEY)) {
        agg.totalSegments = (agg.totalSegments ?? 0) + asNumber(tags.get(SEGMENTS_KEY));
      }
      if (tags.has(INPUT_TOKENS_KEY)) {
        agg.totalInputTokens =
          (agg.totalInputTokens ?? 0) + asNumber(tags.get(INPUT_TOKENS_KEY));
      }
      if (tags.has(OUTPUT_TOKENS_KEY)) {
        agg.totalOutputTokens =
          (agg.totalOutputTokens ?? 0) + asNumber(tags.get(OUTPUT_TOKENS_KEY));
      }
      byOp.set(op, agg);
      totalFee += fee;
      totalGas += gas;
    }
  }

  return {
    spansScanned: scanned,
    spansAttributed: attributed,
    spansSkipped: skipped,
    byOp: Object.fromEntries(
      [...byOp.entries()].sort(([a], [b]) => a.localeCompare(b))
    ),
    totalGas,
    totalFeeWei: totalFee,
  };
}

/** Render a forecast to human-readable lines (CLI default mode). */
export function renderForecast(forecast: JaegerForecast, source: string): string[] {
  const lines: string[] = [];
  lines.push(`Forecast from jaeger (${source}):`);
  lines.push(`  spans scanned   ${forecast.spansScanned}`);
  lines.push(`  spans 0gkit.*   ${forecast.spansAttributed}`);
  if (forecast.spansSkipped > 0) {
    lines.push(
      `  skipped         ${forecast.spansSkipped} (dry-run / errored — excluded from totals)`
    );
  }
  const ops = Object.entries(forecast.byOp);
  if (ops.length === 0) {
    lines.push(`  (no 0gkit.* spans with op + fee attributes found)`);
  }
  for (const [op, agg] of ops) {
    const extras: string[] = [];
    if (agg.totalSizeBytes !== undefined)
      extras.push(`sizeBytes=${agg.totalSizeBytes}`);
    if (agg.totalSegments !== undefined) extras.push(`segments=${agg.totalSegments}`);
    if (agg.totalInputTokens !== undefined)
      extras.push(`inputTokens=${agg.totalInputTokens}`);
    if (agg.totalOutputTokens !== undefined)
      extras.push(`outputTokens=${agg.totalOutputTokens}`);
    const extra = extras.length > 0 ? `  ${extras.join(" ")}` : "";
    lines.push(
      `  ${op.padEnd(22)} count=${agg.count}  gas=${agg.totalGas}  feeWei=${agg.totalFeeWei}${extra}`
    );
  }
  lines.push(`Total: gas=${forecast.totalGas} feeWei=${forecast.totalFeeWei}`);
  return lines;
}

/** Build the JSON envelope for `--json` mode. */
export function forecastToJson(
  forecast: JaegerForecast,
  source: string
): Record<string, unknown> {
  const byOp: Record<string, Record<string, unknown>> = {};
  for (const [op, agg] of Object.entries(forecast.byOp)) {
    const entry: Record<string, unknown> = {
      count: agg.count,
      totalGas: agg.totalGas.toString(),
      totalFeeWei: agg.totalFeeWei.toString(),
    };
    if (agg.totalSizeBytes !== undefined) entry.totalSizeBytes = agg.totalSizeBytes;
    if (agg.totalSegments !== undefined) entry.totalSegments = agg.totalSegments;
    if (agg.totalInputTokens !== undefined)
      entry.totalInputTokens = agg.totalInputTokens;
    if (agg.totalOutputTokens !== undefined)
      entry.totalOutputTokens = agg.totalOutputTokens;
    byOp[op] = entry;
  }
  return {
    source: "jaeger",
    file: source,
    spansScanned: forecast.spansScanned,
    spansAttributed: forecast.spansAttributed,
    spansSkipped: forecast.spansSkipped,
    byOp,
    totalGas: forecast.totalGas.toString(),
    totalFeeWei: forecast.totalFeeWei.toString(),
  };
}
