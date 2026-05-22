import { resolve } from "node:path";
import type { Command } from "commander";
import { ConfigError, formatEstimate } from "@foundryprotocol/0gkit-core";
import { runCommand, type ProgramDeps } from "../program.js";
import { bigintsToStrings } from "./_helpers.js";

function storageNetwork(ctx: { network: string }): "aristotle" | "galileo" {
  if (ctx.network !== "aristotle" && ctx.network !== "galileo") {
    throw new ConfigError(
      `0g storage does not support --network ${ctx.network}.`,
      `Use --network galileo (testnet, default) or --network aristotle.`
    );
  }
  return ctx.network;
}

export function registerStorage(program: Command, deps: ProgramDeps): void {
  const storage = program
    .command("storage")
    .description("0G Storage: put, get, exists");

  storage
    .command("put <file>")
    .description("upload a file's bytes; prints root + tx")
    .option("--dry-run", "estimate cost without broadcasting", false)
    .action(async function (this: Command, file: string) {
      await runCommand(deps, this, async (ctx) => {
        const opts = this.opts() as { dryRun?: boolean };
        const network = storageNetwork(ctx);
        if (!ctx.privateKey && !opts.dryRun) {
          throw new ConfigError(
            `0g storage put requires a signer key (funds the upload tx).`,
            `Set ZEROG_PRIVATE_KEY or pass --private-key. Or use --dry-run.`
          );
        }
        const data = await deps.fs.readFile(file);
        const s = deps.makeStorage({
          network,
          rpcUrl: ctx.rpcUrl,
          privateKey: ctx.privateKey,
        });
        if (opts.dryRun) {
          const dr = await s.upload(data, { dryRun: true });
          return {
            human: [
              `[dry-run] would upload ${file} (${data.length} bytes)`,
              ...formatEstimate(dr.estimate).split("\n"),
              `  root ${dr.result.root}`,
            ],
            json: bigintsToStrings(dr) as Record<string, unknown>,
          };
        }
        const r = await s.upload(data);
        const tx = deps.attachExplorerUrl(r.tx, deps.getNetwork(ctx.network));
        return {
          human: [
            `uploaded ${file} (${data.length} bytes)`,
            `  root ${r.root}`,
            `  tx   ${tx.txHash}`,
            tx.explorerUrl ? `  ${tx.explorerUrl}` : ``,
          ].filter(Boolean),
          json: {
            root: r.root,
            txHash: tx.txHash ?? null,
            explorerUrl: tx.explorerUrl ?? null,
            bytes: data.length,
          },
        };
      });
    });

  storage
    .command("get <root> [out]")
    .description("download by root; writes to [out] or prints byte count")
    .action(async function (this: Command, root: string, out: string | undefined) {
      await runCommand(deps, this, async (ctx) => {
        const network = storageNetwork(ctx);
        const s = deps.makeStorage({ network, rpcUrl: ctx.rpcUrl });
        const bytes = await s.download(root);
        if (out) {
          await deps.fs.writeFile(resolve(deps.cwd(), out), bytes);
        }
        return {
          human: [
            `downloaded ${root} (${bytes.length} bytes)`,
            out ? `  → ${out}` : `  (no out path; pass [out] to save)`,
          ],
          json: { root, bytes: bytes.length, out: out ?? null },
        };
      });
    });

  storage
    .command("exists <root>")
    .description("true if the root is retrievable")
    .action(async function (this: Command, root: string) {
      await runCommand(deps, this, async (ctx) => {
        const network = storageNetwork(ctx);
        const s = deps.makeStorage({ network, rpcUrl: ctx.rpcUrl });
        const exists = await s.exists(root);
        return {
          human: [`${root}: ${exists ? "exists" : "not found"}`],
          json: { root, exists },
        };
      });
    });
}
