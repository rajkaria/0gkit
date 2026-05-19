import type { Command } from "commander";
import { runCommand, type ProgramDeps } from "../program.js";
import type { CommandResult } from "../output.js";

interface Check {
  name: string;
  ok: boolean;
  required: boolean;
  detail: string;
  hint: string;
}

export function registerDoctor(program: Command, deps: ProgramDeps): void {
  program
    .command("doctor")
    .description("preflight: RPC, signer, storage indexer, DA encoder, faucet")
    .action(async function (this: Command) {
      await runCommand(deps, this, async (ctx): Promise<CommandResult> => {
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
          });
        } catch (e) {
          checks.push({
            name: "rpc",
            ok: false,
            required: true,
            detail: `unreachable: ${(e as Error).message}`,
            hint: `Set --rpc or ZEROG_RPC_URL to a reachable ${ctx.network} JSON-RPC.`,
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
            checks.push({
              name: "signer",
              ok: wei > 0n,
              required: false,
              detail: `${addr} — ${wei.toString()} wei`,
              hint:
                wei > 0n
                  ? "ok"
                  : preset.faucetWebUrl
                    ? `Fund it at ${preset.faucetWebUrl}.`
                    : `Fund this address on ${ctx.network}.`,
            });
          } catch (e) {
            checks.push({
              name: "signer",
              ok: false,
              required: false,
              detail: `key set but balance check failed: ${(e as Error).message}`,
              hint: "Verify the key is a 32-byte hex and the RPC is reachable.",
            });
          }
        }

        // 3. Storage indexer + 4. DA encoder reachability (soft).
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
          },
        ]) {
          if (!probe.url) {
            checks.push({
              name: probe.name,
              ok: false,
              required: false,
              detail: `no preset endpoint for ${ctx.network}`,
              hint: probe.hint,
            });
            continue;
          }
          try {
            const res = await deps.fetch(probe.url, { method: "GET" });
            checks.push({
              name: probe.name,
              ok: res.status < 500,
              required: false,
              detail: `${probe.url} → HTTP ${res.status}`,
              hint: res.status < 500 ? "ok" : probe.hint,
            });
          } catch (e) {
            checks.push({
              name: probe.name,
              ok: false,
              required: false,
              detail: `${probe.url} unreachable: ${(e as Error).message}`,
              hint: probe.hint,
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
        return {
          human: [
            `0g doctor — network ${ctx.network}`,
            ...checks.map(
              (c) =>
                `  ${mark(c)} ${c.name}: ${c.detail}` +
                (c.ok || c.hint === "ok" ? "" : `\n      → ${c.hint}`)
            ),
            ok
              ? `all required checks passed`
              : `${failed.length} required check(s) failed`,
          ],
          json: { network: ctx.network, ok, checks },
        };
      });
    });
}
