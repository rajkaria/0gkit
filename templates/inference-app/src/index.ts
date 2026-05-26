/**
 * inference-app — discover a 0G Compute provider and run a chat completion.
 *
 * 1. Construct a Compute client from a funded broker key.
 * 2. If no PROVIDER is set, list on-chain providers and pick the first.
 * 3. Run an OpenAI-compatible chat completion and print the answer.
 */
import { Compute } from "@foundryprotocol/0gkit-compute";
import {
  ZeroGError,
  detectLocalDevnet,
  printFirstSuccess,
} from "@foundryprotocol/0gkit-core";
import { config } from "../0g.config.js";

/** Best-effort extraction of a provider address from a listService() entry. */
function pickProviderAddress(entry: unknown): string | undefined {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") {
    const o = entry as Record<string, unknown>;
    for (const key of ["provider", "address", "0", "providerAddress"]) {
      if (typeof o[key] === "string") return o[key] as string;
    }
  }
  return undefined;
}

async function main(): Promise<void> {
  const env = config.server();
  let network: "galileo" | "aristotle" | "local" = env.ZEROG_NETWORK;
  if (network === "galileo" && (await detectLocalDevnet())) {
    console.warn("[0gkit] Local devnet detected — using network=local.");
    network = "local";
  }

  const brokerKey = env.BROKER_KEY;
  const model = env.MODEL;
  const prompt = env.PROMPT;

  let provider = env.PROVIDER;

  if (!provider) {
    console.log("No PROVIDER set — discovering one from the 0G network…");
    // Compute SDK currently accepts only "aristotle" | "galileo"; "local" is
    // surfaced through unchanged so users hit a clear SDK error rather than a
    // silent retarget to mainnet.
    const discovery = new Compute({
      network: network as "galileo" | "aristotle",
      brokerKey,
    });
    const services = await discovery.listProviders();
    for (const s of services) {
      const addr = pickProviderAddress(s);
      if (addr) {
        provider = addr;
        break;
      }
    }
    if (!provider) {
      console.error("No 0G compute providers were discoverable. Set PROVIDER in .env.");
      process.exit(1);
    }
    console.log(`  Using provider ${provider}`);
  }

  const compute = new Compute({
    network: network as "galileo" | "aristotle",
    brokerKey,
    provider,
    model,
  });

  console.log(`Asking the 0G provider: "${prompt}"`);
  const { output, receipt } = await compute.inference({
    messages: [{ role: "user", content: prompt }],
  });

  console.log("\n--- answer ---");
  console.log(output.trim());
  console.log("--------------");
  console.log(
    `latency ${receipt.latencyMs}ms` +
      (receipt.txHash ? `  settlement tx ${receipt.txHash}` : "")
  );

  printFirstSuccess({
    op: "compute.inference",
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
