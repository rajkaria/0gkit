import type { Command } from "commander";
import { runCommand, type ProgramDeps } from "../program.js";
import type { CommandResult } from "../output.js";
import {
  rpcFallbackCmd,
  genEnvFromConfig,
  bumpStalePins,
  type DoctorFixDeps,
} from "./doctor-fix.js";

interface Check {
  name: string;
  ok: boolean;
  required: boolean;
  detail: string;
  hint: string;
  /** K5-D: command the user can run to fix this check. Printed in human mode and included in JSON. */
  fixCmd?: string;
  /** K5-D: run automatically when `--fix` is passed. Never installs or mutates network (D85). */
  fix?: () => Promise<string | null>;
}

export function registerDoctor(program: Command, deps: ProgramDeps): void {
  program
    .command("doctor")
    .description("preflight: RPC, signer, storage indexer, DA encoder, faucet")
    .option("--fix", "apply safe auto-fixes (.env* regen, print stale-pin cmd)")
    .action(async function (this: Command) {
      await runCommand(deps, this, async (ctx): Promise<CommandResult> => {
        const fix: boolean = (this.opts() as { fix?: boolean }).fix ?? false;
        const checks: Check[] = [];
        const preset = deps.getNetwork(ctx.network);

        // 1. RPC reachable + chainId matches the preset (required).
        try {
          const client = deps.createClient({
            network: ctx.network,
            rpcUrl: ctx.rpcUrl,
          });
          const observed = await client.public.getChainId();
          const expected = preset.chainId;
          const ok = expected === undefined || observed === expected;
          checks.push({
            name: "rpc",
            ok,
            required: true,
            detail: `chainId ${observed} (expected ${expected ?? "any"})`,
            hint: ok
              ? "ok"
              : `RPC is reachable but reports the wrong chain. Pass --rpc for ${ctx.network} or check ZEROG_RPC_URL.`,
            fixCmd: ok
              ? undefined
              : `export ZEROG_RPC_URL=<url>  # then re-run with --network ${ctx.network}`,
          });
        } catch (e) {
          checks.push({
            name: "rpc",
            ok: false,
            required: true,
            detail: `unreachable: ${(e as Error).message}`,
            hint: `Set --rpc or ZEROG_RPC_URL to a reachable ${ctx.network} JSON-RPC.`,
            fixCmd: rpcFallbackCmd(ctx.network),
          });
        }

        // 2. Signer present + funded (soft — read-only use is valid).
        if (!ctx.privateKey) {
          checks.push({
            name: "signer",
            ok: false,
            required: false,
            detail: "no private key — read-only mode",
            hint: "Set ZEROG_PRIVATE_KEY (or --private-key) to send transactions.",
            fixCmd: `export ZEROG_PRIVATE_KEY=<key>  # then re-run`,
          });
        } else {
          try {
            const client = deps.createClient({
              network: ctx.network,
              rpcUrl: ctx.rpcUrl,
              privateKey: ctx.privateKey,
            });
            const addr = client.wallet?.account?.address ?? "(unknown)";
            const wei = await deps.balance(client, addr);
            const faucetHint = preset.faucetWebUrl
              ? `Fund it at ${preset.faucetWebUrl}.`
              : `Fund this address on ${ctx.network}.`;
            checks.push({
              name: "signer",
              ok: wei > 0n,
              required: false,
              detail: `${addr} — ${wei.toString()} wei`,
              hint: wei > 0n ? "ok" : faucetHint,
              fixCmd:
                wei > 0n
                  ? undefined
                  : preset.faucetWebUrl
                    ? `open ${preset.faucetWebUrl}  # fund ${addr}`
                    : undefined,
            });
          } catch (e) {
            checks.push({
              name: "signer",
              ok: false,
              required: false,
              detail: `key set but balance check failed: ${(e as Error).message}`,
              hint: "Verify the key is a 32-byte hex and the RPC is reachable.",
              fixCmd: `export ZEROG_RPC_URL=<url>  # verify key is 32-byte hex`,
            });
          }
        }

        // 3. Storage indexer + 4. DA encoder reachability (soft).
        // Build DoctorFixDeps for env-regen fixer (used when probes fail).
        const fixerDeps: DoctorFixDeps = {
          fs: {
            exists: deps.fs.exists,
            writeFile: (p, data) => deps.fs.writeFile(p, data as string),
          },
          loadProjectConfig:
            deps.doctorFix?.loadProjectConfig ?? (async (_cwd) => null), // Production: honest null (D85)
          readProjectPins: deps.doctorFix?.readProjectPins ?? (async (_cwd) => ({})),
          latestVersion: deps.doctorFix?.latestVersion ?? (async (_pkg) => "0.0.0"),
        };

        for (const probe of [
          {
            name: "storage-indexer",
            url:
              ctx.network === "galileo"
                ? "https://indexer-storage-testnet.0g.ai"
                : ctx.network === "aristotle"
                  ? "https://indexer-storage.0g.network"
                  : undefined,
            hint: "Pass ZEROG_INDEXER_URL or use --network galileo|aristotle.",
            fixCmd: `0g doctor --fix  # re-gen .env from define0GConfig`,
          },
          {
            name: "da-encoder",
            url:
              ctx.network === "galileo"
                ? "https://da-encoder-testnet.0g.ai"
                : ctx.network === "aristotle"
                  ? "https://da-encoder.0g.network"
                  : undefined,
            hint: "DA falls back to local-digest mode; set ZEROG_DA_ENCODER_URL for live mode.",
            fixCmd: `0g doctor --fix  # re-gen .env from define0GConfig`,
          },
        ]) {
          if (!probe.url) {
            checks.push({
              name: probe.name,
              ok: false,
              required: false,
              detail: `no preset endpoint for ${ctx.network}`,
              hint: probe.hint,
              fixCmd: probe.fixCmd,
              fix: async () => genEnvFromConfig(deps.cwd(), fixerDeps),
            });
            continue;
          }
          try {
            const res = await deps.fetch(probe.url, { method: "GET" });
            const ok = res.status < 500;
            checks.push({
              name: probe.name,
              ok,
              required: false,
              detail: `${probe.url} → HTTP ${res.status}`,
              hint: ok ? "ok" : probe.hint,
              fixCmd: ok ? undefined : probe.fixCmd,
              fix: ok ? undefined : async () => genEnvFromConfig(deps.cwd(), fixerDeps),
            });
          } catch (e) {
            checks.push({
              name: probe.name,
              ok: false,
              required: false,
              detail: `${probe.url} unreachable: ${(e as Error).message}`,
              hint: probe.hint,
              fixCmd: probe.fixCmd,
              fix: async () => genEnvFromConfig(deps.cwd(), fixerDeps),
            });
          }
        }

        // 5. Faucet guidance (informational — never fails the run).
        checks.push({
          name: "faucet",
          ok: Boolean(preset.faucetUrl ?? preset.faucetWebUrl),
          required: false,
          detail: preset.faucetUrl
            ? "programmatic faucet available"
            : preset.faucetWebUrl
              ? `web faucet: ${preset.faucetWebUrl}`
              : "no faucet for this network",
          hint: preset.faucetWebUrl
            ? `Use \`0g chain faucet <addr>\` or visit ${preset.faucetWebUrl}.`
            : "Use --network galileo for a testnet faucet.",
        });

        const failed = checks.filter((c) => c.required && !c.ok);
        const ok = failed.length === 0;
        const mark = (c: Check) => (c.ok ? "✓" : c.required ? "✗" : "•");
        if (!ok) process.exitCode = 1;

        // K5-D: run fixers when --fix is set, collecting result lines.
        const fixLines: string[] = [];
        if (fix) {
          // Run the stale-pin fixer across the whole project (once, not per-check).
          const pinCmd = await bumpStalePins(deps.cwd(), fixerDeps);
          if (pinCmd) fixLines.push(`  pin bump: ${pinCmd}`);

          for (const c of checks) {
            if (!c.ok && c.fix) {
              const result = await c.fix();
              if (result) fixLines.push(`  ${c.name}: ${result}`);
            }
          }
        }

        // Strip internal `fix` function from JSON output (not serialisable).
        const jsonChecks = checks.map(({ fix: _fix, ...rest }) => rest);

        return {
          human: [
            `0g doctor — network ${ctx.network}`,
            ...checks.map(
              (c) =>
                `  ${mark(c)} ${c.name}: ${c.detail}` +
                (!c.ok && c.fixCmd
                  ? `\n      → run: ${c.fixCmd} to fix`
                  : !c.ok && c.hint && c.hint !== "ok"
                    ? `\n      → ${c.hint}`
                    : "")
            ),
            ok
              ? `all required checks passed`
              : `${failed.length} required check(s) failed`,
            ...(fixLines.length ? ["", "fixes applied:", ...fixLines] : []),
          ],
          json: { network: ctx.network, ok, checks: jsonChecks },
        };
      });
    });
}
