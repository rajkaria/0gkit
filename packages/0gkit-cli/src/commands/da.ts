import type { Command } from "commander";
import { formatEstimate } from "@foundryprotocol/0gkit-core";
import { runCommand, type ProgramDeps } from "../program.js";
import { bigintsToStrings } from "./_helpers.js";

async function readPayload(deps: ProgramDeps, fileOrDash: string): Promise<Uint8Array> {
  if (fileOrDash === "-") return deps.readStdin();
  return deps.fs.readFile(fileOrDash);
}

function daNetwork(network: string): "aristotle" | "galileo" | undefined {
  return network === "aristotle" || network === "galileo" ? network : undefined;
}

export function registerDa(program: Command, deps: ProgramDeps): void {
  const da = program.command("da").description("0G Data Availability: publish, verify");

  da.command("publish <file>")
    .description("publish a blob ('-' = stdin); local-digest mode off-net")
    .option("--dry-run", "estimate cost without broadcasting", false)
    .action(async function (this: Command, file: string) {
      await runCommand(deps, this, async (ctx) => {
        const opts = this.opts() as { dryRun?: boolean };
        const data = await readPayload(deps, file);
        const client = deps.makeDA({ network: daNetwork(ctx.network) });
        if (opts.dryRun) {
          const dr = await client.publish(data, { dryRun: true });
          return {
            human: [
              `[dry-run] would publish ${file === "-" ? "stdin" : file} (${data.length} bytes)`,
              ...formatEstimate(dr.estimate).split("\n"),
              `  digest ${dr.result.digest}`,
            ],
            json: bigintsToStrings(dr) as Record<string, unknown>,
          };
        }
        const r = await client.publish(data);
        return {
          human: [
            `published (${r.mode} mode, ${r.latencyMs} ms)`,
            `  digest ${r.digest}`,
            r.daRef ? `  daRef  ${r.daRef}` : `  daRef  (local mode — no ref)`,
          ],
          json: {
            digest: r.digest,
            daRef: r.daRef ?? null,
            blobId: r.blobId ?? null,
            mode: r.mode,
            latencyMs: r.latencyMs,
          },
        };
      });
    });

  da.command("verify <file> <digest>")
    .description("local integrity check: recompute digest and compare")
    .action(async function (this: Command, file: string, digest: string) {
      await runCommand(deps, this, async (ctx) => {
        const data = await readPayload(deps, file);
        const client = deps.makeDA({ network: daNetwork(ctx.network) });
        const verified = client.verify(data, digest);
        return {
          human: [`digest ${digest}`, `  ${verified ? "MATCH" : "MISMATCH"}`],
          json: { digest, verified },
        };
      });
    });
}
