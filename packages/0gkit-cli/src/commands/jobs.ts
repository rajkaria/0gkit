import type { Command } from "commander";
import { ConfigError } from "@foundryprotocol/0gkit-core";
import { runCommand, type ProgramDeps } from "../program.js";

export interface JobBackendLike {
  status(id: string): Promise<{
    id: string;
    name: string;
    state: string;
    input: unknown;
    result?: unknown;
    error?: string;
    metadata: {
      attempts: number;
      createdAt: number;
      startedAt?: number;
      finishedAt?: number;
      lastError?: string;
    };
  } | null>;
  close(): Promise<void>;
}

export type JobsBackendKind = "memory" | "sqlite";

export type JobsBackendFactory = (
  kind: JobsBackendKind,
  path: string
) => JobBackendLike;

interface JobsOpts {
  backend: string;
  path: string;
}

function fmtTs(ms: number | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toISOString();
}

export function registerJobs(program: Command, deps: ProgramDeps): void {
  const jobs = program.command("jobs").description("Inspect 0gkit-jobs queues.");

  jobs
    .command("status <id>")
    .description("Print the JobRecord for a given job id.")
    .option("--backend <kind>", "memory|sqlite", "sqlite")
    .option("--path <path>", "sqlite file path", "./.jobs.db")
    .action(async function (this: Command, id: string) {
      await runCommand(deps, this, async () => {
        const opts = this.opts() as JobsOpts;
        if (opts.backend !== "memory" && opts.backend !== "sqlite") {
          throw new ConfigError(
            `0g jobs status: unknown backend "${opts.backend}".`,
            "use --backend memory or --backend sqlite."
          );
        }
        const backend = deps.jobsBackendFactory(opts.backend, opts.path);
        try {
          const rec = await backend.status(id);
          if (!rec) {
            throw new ConfigError(
              `no job with id ${id}`,
              "verify the id; the memory backend forgets jobs when the process exits."
            );
          }
          const human = [
            `job ${rec.id}`,
            `  name      ${rec.name}`,
            `  state     ${rec.state}`,
            `  attempts  ${rec.metadata.attempts}`,
            `  created   ${fmtTs(rec.metadata.createdAt)}`,
            `  started   ${fmtTs(rec.metadata.startedAt)}`,
            `  finished  ${fmtTs(rec.metadata.finishedAt)}`,
          ];
          if (rec.error) human.push(`  error     ${rec.error}`);
          if (rec.metadata.lastError) {
            human.push(`  last-err  ${rec.metadata.lastError}`);
          }
          return {
            human,
            json: rec as unknown as Record<string, unknown>,
          };
        } finally {
          await backend.close();
        }
      });
    });
}
