import type { Command } from "commander";
import { ConfigError } from "@foundryprotocol/0gkit-core";
import { runCommand, type ProgramDeps } from "../program.js";

function inferNetwork(network: string): "aristotle" | "galileo" | undefined {
  return network === "aristotle" || network === "galileo" ? network : undefined;
}

export function registerInfer(program: Command, deps: ProgramDeps): void {
  program
    .command("infer")
    .description("run a chat completion against a 0G compute provider")
    .option("-m, --message <text>", "prompt text (default: read stdin)")
    .option("--provider <address>", "0G inference provider (or env ZEROG_PROVIDER)")
    .option("--model <name>", "model id (provider default if omitted)")
    .option("--temperature <n>", "sampling temperature", parseFloat)
    .action(async function (this: Command) {
      await runCommand(deps, this, async (ctx) => {
        const opts = this.opts() as {
          message?: string;
          provider?: string;
          model?: string;
          temperature?: number;
        };
        const brokerKey = deps.env.ZEROG_BROKER_KEY ?? ctx.privateKey;
        if (!brokerKey) {
          throw new ConfigError(
            `0g infer requires a funded broker key.`,
            `Set ZEROG_BROKER_KEY (or ZEROG_PRIVATE_KEY / --private-key).`
          );
        }
        const provider = opts.provider ?? deps.env.ZEROG_PROVIDER;
        if (!provider) {
          throw new ConfigError(
            `0g infer requires a provider address.`,
            `Pass --provider <address> or set ZEROG_PROVIDER.`
          );
        }
        const content =
          opts.message ?? new TextDecoder().decode(await deps.readStdin()).trim();
        if (!content) {
          throw new ConfigError(
            `No prompt provided.`,
            `Pass -m "your prompt" or pipe text on stdin.`
          );
        }
        const compute = deps.makeCompute({
          network: inferNetwork(ctx.network),
          brokerKey,
          brokerRpc: ctx.rpcUrl,
          provider,
          model: opts.model,
        });
        const r = await compute.inference({
          messages: [{ role: "user", content }],
          model: opts.model,
          temperature: opts.temperature,
        });
        return {
          human: [
            r.output,
            ``,
            `  provider ${provider}  (${r.receipt.latencyMs} ms)`,
            r.receipt.txHash ? `  fee tx ${r.receipt.txHash}` : `  (no fee tx)`,
          ],
          json: {
            output: r.output,
            provider,
            txHash: r.receipt.txHash ?? null,
            latencyMs: r.receipt.latencyMs,
          },
        };
      });
    });
}
