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
    .command("import [address]")
    .description(
      "Fetch a verified ABI from the chain explorer (or use --abi) and codegen a typed client"
    )
    .option("--abi <path>", "use an off-chain artifact JSON instead of fetching")
    .option("--name <name>", "contract name (and output filename)")
    .option("--out <dir>", "output directory", "./0gkit/contracts")
    .action(async function (this: Command, address: string | undefined) {
      await runCommand(deps, this, async (ctx) => {
        const opts = this.opts() as { abi?: string; name?: string; out: string };
        let abiPath = opts.abi;
        let source: string;
        if (abiPath) {
          source = opts.abi as string;
        } else {
          if (!address) {
            throw new ConfigError(
              "Pass a contract <address> or --abi <path>.json.",
              "e.g. 0g contracts import 0xAbc… --name MyToken"
            );
          }
          if (!opts.name) {
            throw new ConfigError(
              "`--name <Name>` is required when importing by address.",
              "The explorer's `getabi` returns no contract name — e.g. 0g contracts import 0xAbc… --name MyToken."
            );
          }
          const abi = await deps.contracts.fetchExplorerAbi(address, ctx.network);
          abiPath = await deps.contracts.writeTempAbi(abi, opts.name);
          source = `${ctx.network} explorer (${address})`;
        }
        const result = await deps.contracts.generate({
          abiPath,
          outDir: opts.out,
          name: opts.name,
        });
        return {
          human: [
            `✓ imported ${result.name} → ${result.outputPath}`,
            `  source: ${source}`,
            `  ${result.bytesWritten} bytes`,
          ],
          json: {
            ...result,
            address: address ?? null,
            network: ctx.network,
            abi: opts.abi ?? null,
          },
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
