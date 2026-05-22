import type { Command } from "commander";
import { formatEstimate, ConfigError, ZeroGError } from "@foundryprotocol/0gkit-core";
import { runCommand, type ProgramDeps } from "../program.js";
import { bigintsToStrings } from "./_helpers.js";

function storageNetwork(ctx: { network: string }): "aristotle" | "galileo" {
  if (ctx.network !== "aristotle" && ctx.network !== "galileo") {
    throw new ConfigError(
      `0g estimate storage does not support --network ${ctx.network}.`,
      `Use --network galileo (default) or --network aristotle.`
    );
  }
  return ctx.network;
}

function inferNetwork(network: string): "aristotle" | "galileo" | undefined {
  return network === "aristotle" || network === "galileo" ? network : undefined;
}

export function registerEstimate(program: Command, deps: ProgramDeps): void {
  const estimate = program
    .command("estimate")
    .description("estimate cost for storage / compute / da / contracts ops");

  estimate
    .command("storage <file>")
    .description("estimate cost to upload <file> to 0G Storage")
    .action(async function (this: Command, file: string) {
      await runCommand(deps, this, async (ctx) => {
        const network = storageNetwork(ctx);
        const data = await deps.fs.readFile(file);
        const s = deps.makeStorage({ network, rpcUrl: ctx.rpcUrl });
        const est = await s.estimate(data);
        return {
          human: formatEstimate(est).split("\n"),
          json: bigintsToStrings(est) as Record<string, unknown>,
        };
      });
    });

  estimate
    .command("compute")
    .description("estimate cost for a compute (chat completion) call")
    .option("-p, --prompt <text>", "prompt text")
    .option("--model <name>", "model id (provider default if omitted)")
    .option("--max-output <n>", "max output tokens (default 512)", (v) =>
      Number.parseInt(v, 10)
    )
    .action(async function (this: Command) {
      await runCommand(deps, this, async (ctx) => {
        const opts = this.opts() as {
          prompt?: string;
          model?: string;
          maxOutput?: number;
        };
        if (!opts.prompt) {
          throw new ConfigError(
            `--prompt is required.`,
            `Pass --prompt "your prompt text".`
          );
        }
        const c = deps.makeCompute({
          network: inferNetwork(ctx.network),
          brokerRpc: ctx.rpcUrl,
          model: opts.model,
          provider: "0x0000000000000000000000000000000000000000",
        });
        const est = await c.estimate({
          messages: [{ role: "user", content: opts.prompt }],
          model: opts.model,
          maxOutputTokens: opts.maxOutput,
        });
        return {
          human: formatEstimate(est).split("\n"),
          json: bigintsToStrings(est) as Record<string, unknown>,
        };
      });
    });

  estimate
    .command("da [file]")
    .description("estimate cost to publish [file] (or --bytes <n>) to 0G DA")
    .option("--bytes <n>", "size in bytes (alternative to <file>)", (v) =>
      Number.parseInt(v, 10)
    )
    .action(async function (this: Command, file: string | undefined) {
      await runCommand(deps, this, async (ctx) => {
        const opts = this.opts() as { bytes?: number };
        let payload: Uint8Array;
        if (file && opts.bytes !== undefined) {
          throw new ConfigError(
            `Pass either <file> or --bytes <n>, not both.`,
            `e.g. 0g estimate da ./blob.bin OR 0g estimate da --bytes 4096`
          );
        }
        if (file) {
          payload = await deps.fs.readFile(file);
        } else if (opts.bytes !== undefined && opts.bytes >= 0) {
          payload = new Uint8Array(opts.bytes);
        } else {
          throw new ConfigError(
            `Pass either <file> or --bytes <n>.`,
            `e.g. 0g estimate da ./blob.bin OR 0g estimate da --bytes 4096`
          );
        }
        const da = deps.makeDA({ network: inferNetwork(ctx.network) });
        const est = await da.estimate(payload);
        return {
          human: formatEstimate(est).split("\n"),
          json: bigintsToStrings(est) as Record<string, unknown>,
        };
      });
    });

  estimate
    .command("contracts")
    .description("estimate gas + fee for a contract write method")
    .requiredOption("--abi <path>", "path to ABI JSON (Foundry artifact or raw ABI)")
    .requiredOption("--address <0x>", "contract address")
    .requiredOption("--method <name>", "non-view function to estimate")
    .option("--args <json>", "JSON array of args", "[]")
    .action(async function (this: Command) {
      await runCommand(deps, this, async (ctx) => {
        const opts = this.opts() as {
          abi: string;
          address: string;
          method: string;
          args: string;
        };
        let parsedArgs: unknown[];
        try {
          const v = JSON.parse(opts.args);
          if (!Array.isArray(v)) {
            throw new ZeroGError(
              "CONFIG_INVALID_ARGUMENT",
              "--args must be a JSON array",
              `Pass --args as a JSON array of method arguments. Example: --args '["0xabc...", "1000"]'.`
            );
          }
          parsedArgs = v;
        } catch (err) {
          throw new ConfigError(
            `--args is not a JSON array: ${(err as Error).message}`,
            `Example: --args '["0xabc...", "1000"]'`,
            "CONFIG_INVALID_ARGUMENT"
          );
        }
        if (!opts.address.startsWith("0x") || opts.address.length !== 42) {
          throw new ConfigError(
            `--address must be a 20-byte 0x address.`,
            `Pass --address 0x... (42 chars total).`
          );
        }
        const est = await deps.contracts.estimate({
          abiPath: opts.abi,
          address: opts.address as `0x${string}`,
          method: opts.method,
          args: parsedArgs,
          network: ctx.network,
          rpcUrl: ctx.rpcUrl,
        });
        return {
          human: formatEstimate(est).split("\n"),
          json: bigintsToStrings(est) as Record<string, unknown>,
        };
      });
    });
}
