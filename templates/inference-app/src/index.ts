/**
 * inference-app — run a chat completion without hard-coding a provider.
 *
 * `Compute.router()` picks a provider for you:
 *   - with ROUTER_API_KEY set, it calls the managed 0G Router endpoint
 *     (server-side selection + failover);
 *   - otherwise it selects client-side over the on-chain provider list and
 *     retries/falls back across candidates.
 * Set PROVIDER to pin a specific provider (passed as `prefer`).
 */
import { Compute } from "@foundryprotocol/0gkit-compute";
import {
  ZeroGError,
  detectLocalDevnet,
  printFirstSuccess,
} from "@foundryprotocol/0gkit-core";
import { config } from "../0g.config.js";

async function main(): Promise<void> {
  const env = config.server();
  let network: "galileo" | "aristotle" | "local" = env.ZEROG_NETWORK;
  if (network === "galileo" && (await detectLocalDevnet())) {
    console.warn("[0gkit] Local devnet detected — using network=local.");
    network = "local";
  }

  const model = env.MODEL;
  const prompt = env.PROMPT;

  // Compute SDK currently accepts only "aristotle" | "galileo"; "local" is
  // surfaced through unchanged so users hit a clear SDK error rather than a
  // silent retarget to mainnet.
  const compute = new Compute({
    network: network as "galileo" | "aristotle",
    brokerKey: env.BROKER_KEY,
    ...(model ? { model } : {}),
    ...(env.ROUTER_API_KEY ? { routerApiKey: env.ROUTER_API_KEY } : {}),
  });

  console.log(`Asking the 0G network: "${prompt}"`);
  const { output, receipt } = await compute.router({
    messages: [{ role: "user", content: prompt }],
    ...(env.PROVIDER ? { prefer: env.PROVIDER } : {}),
  });

  // Own a provider relationship? Skip routing and call it directly:
  //   const { output } = await compute.direct({
  //     provider: env.PROVIDER!,
  //     messages: [{ role: "user", content: prompt }],
  //   });

  console.log("\n--- answer ---");
  console.log(output.trim());
  console.log("--------------");
  console.log(
    `latency ${receipt.latencyMs}ms` +
      (receipt.txHash ? `  settlement tx ${receipt.txHash}` : "")
  );

  printFirstSuccess({
    op: "compute.router",
    id: receipt.txHash ?? "ok",
    note: `network=${network}`,
  });
}

main().catch((err: unknown) => {
  if (err instanceof ZeroGError) {
    console.error(`\n${err.name}: ${err.message}`);
    console.error(`Hint: ${err.hint}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
