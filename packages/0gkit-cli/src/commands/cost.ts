import type { Command } from "commander";
import {
  ConfigError,
  formatEstimate,
  type Estimate,
} from "@foundryprotocol/0gkit-core";
import { runCommand, type ProgramDeps } from "../program.js";
import { bigintsToStrings } from "./_helpers.js";
import { aggregateJaegerDump, forecastToJson, renderForecast } from "./jaeger.js";

interface ForecastOpts {
  storage?: number[];
  compute?: string[];
  da?: number;
  fromJaeger?: string;
  json?: boolean;
}

function parseCommaSeparatedInts(v: string, acc: number[] = []): number[] {
  for (const token of v.split(",")) {
    const t = token.trim();
    if (t === "") continue;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) {
      throw new ConfigError(
        `--storage value '${token}' is not a non-negative number.`,
        `Pass comma-separated byte counts, e.g. --storage 1024,4096.`
      );
    }
    acc.push(n);
  }
  return acc;
}

function parseComputeSpec(v: string, acc: string[] = []): string[] {
  acc.push(v);
  return acc;
}

function parseDA(v: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    throw new ConfigError(
      `--da value '${v}' is not a non-negative number.`,
      `Pass a non-negative byte count, e.g. --da 4096.`
    );
  }
  return n;
}

export function registerCost(program: Command, deps: ProgramDeps): void {
  const cost = program
    .command("cost")
    .description("Forecast 0G operation costs across primitives.");

  cost
    .command("forecast")
    .description(
      "Aggregate per-op estimates (storage / compute / da) into a single forecast."
    )
    .option(
      "--storage <bytes...>",
      "comma-separated byte counts to upload (can pass multiple flags)",
      parseCommaSeparatedInts
    )
    .option(
      "--compute <spec...>",
      'pipe-delimited "prompt|model|maxTokens" (can pass multiple flags)',
      parseComputeSpec
    )
    .option("--da <bytes>", "DA payload byte count", parseDA)
    .option(
      "--from-jaeger <path>",
      "aggregate real per-op gas + fee totals from a Jaeger trace JSON dump (mutually exclusive with --storage/--compute/--da)"
    )
    .action(async function (this: Command) {
      await runCommand(deps, this, async () => {
        const opts = this.opts() as ForecastOpts;

        if (opts.fromJaeger) {
          if (
            (opts.storage && opts.storage.length > 0) ||
            (opts.compute && opts.compute.length > 0) ||
            typeof opts.da === "number"
          ) {
            throw new ConfigError(
              "--from-jaeger cannot be combined with --storage, --compute, or --da.",
              "Use --from-jaeger alone to aggregate real per-op costs from a trace, or use the synthesis flags to forecast hypothetical costs."
            );
          }
          // SP14: `-` means read from stdin so `0g traces inspect <id> --json |
          // 0g cost forecast --from-jaeger -` pipes cleanly.
          if (opts.fromJaeger === "-") {
            const stdinBytes = await deps.readStdin();
            let parsed: unknown;
            try {
              parsed = JSON.parse(new TextDecoder().decode(stdinBytes));
            } catch (err) {
              throw new ConfigError(
                `stdin is not valid JSON: ${
                  err instanceof Error ? err.message : String(err)
                }`,
                `Pipe Jaeger JSON into the command: 0g traces inspect <id> --json | 0g cost forecast --from-jaeger -`
              );
            }
            const forecast = aggregateJaegerDump(parsed);
            return {
              human: renderForecast(forecast, "<stdin>"),
              json: forecastToJson(forecast, "<stdin>"),
            };
          }
          let raw: Uint8Array;
          try {
            raw = await deps.fs.readFile(opts.fromJaeger);
          } catch (err) {
            throw new ConfigError(
              `Could not read Jaeger trace file '${opts.fromJaeger}': ${
                err instanceof Error ? err.message : String(err)
              }`,
              "Pass a path to a Jaeger v1 trace JSON file (UI export, or /api/traces response)."
            );
          }
          let parsed: unknown;
          try {
            parsed = JSON.parse(new TextDecoder().decode(raw));
          } catch (err) {
            throw new ConfigError(
              `Jaeger trace file '${opts.fromJaeger}' is not valid JSON: ${
                err instanceof Error ? err.message : String(err)
              }`,
              "Export the trace as JSON (Jaeger UI → Trace → ⋮ → Download JSON), then re-run."
            );
          }
          const forecast = aggregateJaegerDump(parsed);
          return {
            human: renderForecast(forecast, opts.fromJaeger),
            json: forecastToJson(forecast, opts.fromJaeger),
          };
        }

        const byOp: {
          storage: Estimate[];
          compute: Estimate[];
          da: Estimate[];
        } = { storage: [], compute: [], da: [] };
        let totalFee = 0n;
        let totalGas = 0n;

        if (opts.storage && opts.storage.length > 0) {
          for (const bytes of opts.storage) {
            const est = await deps.storageEstimate(bytes);
            byOp.storage.push(est);
            totalFee += BigInt(est.fee);
            totalGas += BigInt(est.gas);
          }
        }

        if (opts.compute && opts.compute.length > 0) {
          for (const spec of opts.compute) {
            const parts = spec.split("|");
            if (parts.length < 1 || parts[0] === "") {
              throw new ConfigError(
                `--compute value '${spec}' is malformed.`,
                `Use --compute "prompt|model|maxTokens" (model/maxTokens optional).`
              );
            }
            const prompt = parts[0]!;
            const model = parts[1] || undefined;
            const maxOutputTokens = parts[2]
              ? Number.parseInt(parts[2], 10)
              : undefined;
            if (
              maxOutputTokens !== undefined &&
              (!Number.isFinite(maxOutputTokens) || maxOutputTokens < 0)
            ) {
              throw new ConfigError(
                `--compute maxTokens for '${spec}' is not a non-negative integer.`,
                `Use --compute "prompt|model|maxTokens" with maxTokens ≥ 0.`
              );
            }
            const est = await deps.computeEstimate({
              prompt,
              model,
              maxOutputTokens,
            });
            byOp.compute.push(est);
            totalFee += BigInt(est.fee);
            totalGas += BigInt(est.gas);
          }
        }

        if (typeof opts.da === "number") {
          const est = await deps.daEstimate(opts.da);
          byOp.da.push(est);
          totalFee += BigInt(est.fee);
          totalGas += BigInt(est.gas);
        }

        const total = byOp.storage.length + byOp.compute.length + byOp.da.length;
        if (total === 0) {
          throw new ConfigError(
            "No ops to forecast — pass at least one of --storage, --compute, --da.",
            `Example: 0g cost forecast --storage 1024 --compute "hello|llama-3-8b|256" --da 4096`
          );
        }

        const human: string[] = [];
        human.push("Forecast:");
        for (const est of byOp.storage) {
          human.push(`  storage:`);
          for (const line of formatEstimate(est).split("\n")) {
            human.push(`    ${line}`);
          }
        }
        for (const est of byOp.compute) {
          human.push(`  compute:`);
          for (const line of formatEstimate(est).split("\n")) {
            human.push(`    ${line}`);
          }
        }
        for (const est of byOp.da) {
          human.push(`  da:`);
          for (const line of formatEstimate(est).split("\n")) {
            human.push(`    ${line}`);
          }
        }
        human.push(`Total: gas=${totalGas} feeWei=${totalFee}`);

        return {
          human,
          json: {
            byOp: bigintsToStrings(byOp) as Record<string, unknown>,
            totalGas: totalGas.toString(),
            totalFeeWei: totalFee.toString(),
          },
        };
      });
    });
}
