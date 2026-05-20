import type { Command } from "commander";
import type { ProgramDeps } from "../program.js";

export function registerDev(program: Command, deps: ProgramDeps): void {
  const dev = program
    .command("dev")
    .description("local 0G stack (chain + storage + compute + DA)");

  dev
    .command("start", { isDefault: true })
    .description("start the local devnet")
    .option(
      "--accounts <n>",
      "number of prefunded dev accounts",
      (v: string) => parseInt(v, 10),
      10
    )
    .option("--mnemonic <phrase>", "custom HD mnemonic")
    .option("--port-chain <n>", "anvil port", (v: string) => parseInt(v, 10), 8545)
    .option(
      "--port-storage <n>",
      "storage mock port",
      (v: string) => parseInt(v, 10),
      5678
    )
    .option(
      "--port-compute <n>",
      "compute mock port",
      (v: string) => parseInt(v, 10),
      5679
    )
    .option("--port-da <n>", "DA mock port", (v: string) => parseInt(v, 10), 5680)
    .option("--state-dir <path>", "state directory (default: ~/.0g-dev)")
    .option("--detach", "exit after services are up (for tests/CI)")
    .action(async function (this: Command) {
      const opts = this.opts();
      if (await deps.devnet.isRunning({ stateDir: opts.stateDir })) {
        deps.write(
          "0g dev is already running. Run `0g dev stop` first, or `0g dev status` to inspect."
        );
        process.exitCode = 1;
        return;
      }
      const handle = await deps.devnet.startDevnet({
        accounts: opts.accounts,
        mnemonic: opts.mnemonic,
        ports: {
          chain: opts.portChain,
          storage: opts.portStorage,
          compute: opts.portCompute,
          da: opts.portDa,
        },
        stateDir: opts.stateDir,
      });
      deps.write("0g dev — local stack up");
      deps.write(`  chain   → ${handle.chain.url}  (chainId ${handle.chain.chainId})`);
      deps.write(`  storage → ${handle.storage.url}`);
      deps.write(`  compute → ${handle.compute.url}  (${handle.compute.mode})`);
      deps.write(`  da      → ${handle.da.url}`);
      deps.write("");
      deps.write(`Mnemonic: ${handle.mnemonic}`);
      deps.write(`Accounts (${handle.accounts.length}, 10000 ETH each):`);
      for (const a of handle.accounts) {
        deps.write(`  [${a.index}] ${a.address}  ${a.privateKey}`);
      }
      deps.write("");
      deps.write("Stop with: 0g dev stop");
      if (opts.detach) return;
      // Keep alive until SIGINT/SIGTERM.
      await new Promise<void>((resolve) => {
        const shutdown = async () => {
          deps.write("\nStopping 0g dev...");
          await handle.stop();
          resolve();
        };
        process.once("SIGINT", shutdown);
        process.once("SIGTERM", shutdown);
      });
    });

  dev
    .command("stop")
    .description("stop the running devnet")
    .option("--state-dir <path>", "state directory")
    .action(async function (this: Command) {
      const opts = this.opts();
      const running = await deps.devnet.isRunning({ stateDir: opts.stateDir });
      if (!running) {
        deps.write("0g dev is not running.");
        return;
      }
      await deps.devnet.stopDevnet({ stateDir: opts.stateDir });
      deps.write("0g dev stopped.");
    });

  dev
    .command("status")
    .description("inspect the running devnet")
    .option("--state-dir <path>", "state directory")
    .action(async function (this: Command) {
      const opts = this.opts();
      const state = deps.devnet.readState({ dir: opts.stateDir });
      const alive = await deps.devnet.isRunning({ stateDir: opts.stateDir });
      if (!state) {
        deps.write("0g dev: not running.");
        return;
      }
      deps.write(`0g dev: ${alive ? "running" : "stale state (process dead)"}`);
      deps.write(`  started ${state.startedAt}`);
      deps.write(`  chain   → ${state.chain.url}  (chainId ${state.chain.chainId})`);
      deps.write(`  storage → ${state.storage.url}`);
      deps.write(`  compute → ${state.compute.url}  (${state.compute.mode})`);
      deps.write(`  da      → ${state.da.url}`);
      if (!alive) {
        deps.write("");
        deps.write("Run `0g dev stop` to clear stale state, then `0g dev start`.");
      }
    });

  dev
    .command("reset")
    .description("stop the devnet and wipe its state directory")
    .option("--state-dir <path>", "state directory")
    .action(async function (this: Command) {
      const opts = this.opts();
      if (await deps.devnet.isRunning({ stateDir: opts.stateDir })) {
        await deps.devnet.stopDevnet({ stateDir: opts.stateDir });
      }
      deps.devnet.clearState({ dir: opts.stateDir });
      deps.write("0g dev: state cleared. Run `0g dev start` to begin fresh.");
    });
}
