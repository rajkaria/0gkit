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
  throw new ZeroGError(
    "OBSERVABILITY_TRACE_DIR_NOT_SET",
    "No trace directory configured.",
    "Set OGKIT_TRACE_DIR=<path> in the process that emitted spans, or pass --dir <path>."
  );
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
          throw new ZeroGError(
            "OBSERVABILITY_TRACE_NOT_FOUND",
            `Trace '${traceId}' not found in ${dir}.`,
            "Run `0g traces list` to see what is in the directory. Trace ids are the hex string after the date in the filename."
          );
        }
        let records: TraceRecord[];
        try {
          records = await deps.tracesReader.readTraceFile(match.path);
        } catch (err) {
          throw new ZeroGError(
            "OBSERVABILITY_TRACE_READ_FAILED",
            `Could not read ${match.path}: ${err instanceof Error ? err.message : String(err)}`,
            "The file may have been truncated or written by an older toolkit version. Delete and re-run with OGKIT_TRACE_DIR set to regenerate."
          );
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
