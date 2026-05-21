import type { Command } from "commander";
import { ConfigError } from "@foundryprotocol/0gkit-core";
import { runCommand, type ProgramDeps } from "../program.js";

interface GenerateOpts {
  abi: string;
  out: string;
  name?: string;
}

export function registerContracts(program: Command, deps: ProgramDeps): void {
  const contracts = program
    .command("contracts")
    .description(
      "Typed contract clients: five standard 0G contracts + `forge build` codegen"
    );

  contracts
    .command("generate")
    .description("Generate a typed TS client from a Foundry artifact JSON")
    .requiredOption("--abi <path>", "path to a forge-build artifact JSON")
    .requiredOption("--out <dir>", "output directory for the generated `.ts` file")
    .option("--name <name>", "override the contract name (and the output filename)")
    .action(async function (this: Command) {
      await runCommand(deps, this, async () => {
        const opts = this.opts() as GenerateOpts;
        const result = await deps.contracts.generate({
          abiPath: opts.abi,
          outDir: opts.out,
          name: opts.name,
        });
        return {
          human: [
            `✓ generated ${result.name} → ${result.outputPath}`,
            `  ${result.bytesWritten} bytes`,
          ],
          json: result,
        };
      });
    });

  contracts
    .command("list")
    .description("List the bundled standard 0G contracts and their pinned addresses")
    .action(async function (this: Command) {
      await runCommand(deps, this, async (ctx) => {
        const list = deps.contracts.listStandard(ctx.network);
        return {
          human: [
            `Standard contracts on network='${ctx.network}':`,
            ...list.map(
              (c) =>
                `  ${c.name.padEnd(22)} ${
                  c.address ?? "(address not yet pinned — pass { address } explicitly)"
                }`
            ),
          ],
          json: { contracts: list },
        };
      });
    });

  contracts
    .command("info <name>")
    .description("Show ABI summary for a bundled standard contract")
    .action(async function (this: Command, name: string) {
      await runCommand(deps, this, async (ctx) => {
        const info = deps.contracts.getStandard(name, ctx.network);
        if (!info) {
          throw new ConfigError(
            `Unknown standard contract: '${name}'.`,
            `Run \`0g contracts list\` to see the available names (erc20, erc721, multicall3, registry, attestationVerifier).`
          );
        }
        const methodPreview = info.methods.slice(0, 6).join(", ");
        return {
          human: [
            `${info.name}  network=${ctx.network}`,
            `  description  ${info.description}`,
            `  address      ${info.address ?? "(not yet pinned)"}`,
            `  methods (${info.methods.length})  ${methodPreview}${
              info.methods.length > 6 ? ", …" : ""
            }`,
            `  events (${info.events.length})  ${info.events.join(", ") || "(none)"}`,
          ],
          json: info,
        };
      });
    });
}
