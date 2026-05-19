/**
 * inference-app — discover a 0G Compute provider and run a chat completion.
 *
 * 1. Construct a Compute client from a funded broker key.
 * 2. If no PROVIDER is set, list on-chain providers and pick the first.
 * 3. Run an OpenAI-compatible chat completion and print the answer.
 */
import { Compute } from "@foundryprotocol/0gkit-compute";
import { ZeroGError } from "@foundryprotocol/0gkit-core";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return v;
}

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
  const brokerKey = requireEnv("BROKER_KEY");
  const network = (process.env.ZEROG_NETWORK ?? "galileo") as "galileo" | "aristotle";
  const model = process.env.MODEL || undefined;
  const prompt = process.env.PROMPT || "In one sentence, what is the 0G network?";

  let provider = process.env.PROVIDER || undefined;

  if (!provider) {
    console.log("No PROVIDER set — discovering one from the 0G network…");
    const discovery = new Compute({ network, brokerKey });
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

  const compute = new Compute({ network, brokerKey, provider, model });

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
