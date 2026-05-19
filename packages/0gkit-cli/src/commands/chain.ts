import type { Command } from "commander";
import { formatEther } from "viem";
import { runCommand, type ProgramDeps } from "../program.js";

export function registerChain(program: Command, deps: ProgramDeps): void {
  const chain = program
    .command("chain")
    .description("native-chain helpers: faucet, balance, tx");

  chain
    .command("faucet <address>")
    .description("request testnet funds (galileo points you at the web faucet)")
    .action(async function (this: Command, address: string) {
      await runCommand(deps, this, async (ctx) => {
        const preset = deps.getNetwork(ctx.network);
        const r = await deps.faucet(preset, address);
        return {
          human: [
            `requested faucet funds for ${address} on ${ctx.network}`,
            r.txHash ? `tx ${r.txHash}` : `(no tx hash returned)`,
          ],
          json: { address, network: ctx.network, txHash: r.txHash ?? null },
        };
      });
    });

  chain
    .command("balance <address>")
    .description("native 0G balance")
    .action(async function (this: Command, address: string) {
      await runCommand(deps, this, async (ctx) => {
        const client = deps.createClient({
          network: ctx.network,
          rpcUrl: ctx.rpcUrl,
        });
        const wei = await deps.balance(client, address);
        const zg = formatEther(wei);
        return {
          human: [`${address}`, `  ${zg} 0G  (${wei.toString()} wei)`],
          json: { address, network: ctx.network, wei: wei.toString(), zg },
        };
      });
    });

  chain
    .command("tx <hash>")
    .description("wait for a tx receipt + explorer link")
    .action(async function (this: Command, hash: string) {
      await runCommand(deps, this, async (ctx) => {
        const client = deps.createClient({
          network: ctx.network,
          rpcUrl: ctx.rpcUrl,
        });
        const r = await deps.waitForReceipt(client, hash);
        return {
          human: [
            `tx ${r.txHash}`,
            `  block ${r.blockNumber?.toString() ?? "?"}  (${r.latencyMs} ms)`,
            r.explorerUrl ? `  ${r.explorerUrl}` : `  (no explorer for ${ctx.network})`,
          ],
          json: {
            txHash: r.txHash ?? null,
            blockNumber: r.blockNumber?.toString() ?? null,
            latencyMs: r.latencyMs,
            explorerUrl: r.explorerUrl ?? null,
          },
        };
      });
    });
}
