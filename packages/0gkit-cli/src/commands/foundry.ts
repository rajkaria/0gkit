import type { Command } from "commander";
import { runCommand, type ProgramDeps } from "../program.js";

/**
 * Foundry is an OPT-IN plugin. The `foundry` command is added only when the
 * plugin resolves at runtime OR the user passes --foundry. It never appears in
 * default help and the neutral CLI has zero static Foundry dependency.
 */
export function registerFoundry(program: Command, deps: ProgramDeps): void {
  const wantsFoundry =
    process.argv.includes("--foundry") ||
    process.argv.includes("foundry") ||
    deps.env.OG_FORCE_FOUNDRY === "1";
  if (!wantsFoundry) return;

  const foundry = program
    .command("foundry")
    .description("[optional plugin] Foundry ownership/revenue layer");

  foundry
    .command("info")
    .description("show the resolved @foundryprotocol/sdk (proves opt-in load)")
    .action(async function (this: Command) {
      await runCommand(deps, this, async () => {
        const plugin = await deps.loadFoundry();
        if (!plugin) {
          return {
            human: [
              `Foundry plugin not installed.`,
              `  install @foundryprotocol/sdk to enable the ownership/revenue layer.`,
            ],
            json: { installed: false },
          };
        }
        return {
          human: [
            `Foundry plugin: ${plugin.name} v${plugin.version}`,
            `  (loaded as an opt-in plugin — neutral core is unchanged)`,
          ],
          json: { installed: true, name: plugin.name, version: plugin.version },
        };
      });
    });
}
