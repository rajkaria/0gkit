/**
 * storage-app — upload a file to 0G Storage with progress, dedup, and dry-run.
 *
 * Thin entry: wires real Storage + Signer into `runStorageFlow`. The flow
 * itself lives in `./storage-flow.ts` so it can be unit-tested with an
 * in-process fake (see src/__tests__/storage-flow.test.ts).
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Storage } from "@foundryprotocol/0gkit-storage";
import { fromPrivateKey } from "@foundryprotocol/0gkit-wallet";
import {
  ZeroGError,
  formatEstimate,
  detectLocalDevnet,
  printFirstSuccess,
} from "@foundryprotocol/0gkit-core";
import { runStorageFlow } from "./storage-flow.js";
import { config } from "../0g.config.js";

async function main(): Promise<void> {
  const env = config.server();
  let network: "galileo" | "aristotle" | "local" = env.ZEROG_NETWORK;
  if (network === "galileo" && (await detectLocalDevnet())) {
    console.warn("[0gkit] Local devnet detected — using network=local.");
    network = "local";
  }

  const signer = await fromPrivateKey(env.PRIVATE_KEY);
  // Storage's config accepts "aristotle" | "galileo". When the typed config
  // resolves to "local", we still pass it through so users get a clear error
  // from Storage rather than a silent fallback to mainnet.
  const storage = new Storage({
    network: network as "galileo" | "aristotle",
    signer,
  });

  const samplePath = fileURLToPath(new URL("./index.ts", import.meta.url));
  const bytes = new Uint8Array(await readFile(samplePath));

  const result = await runStorageFlow(
    { bytes, label: samplePath },
    { storage, log: (m) => console.log(m), formatEstimate }
  );

  if (!result.ok) {
    console.error(`FAILED: ${result.reason}`);
    process.exit(1);
  }
  printFirstSuccess({
    op: "storage.upload",
    id: result.root,
    note: `network=${network}`,
  });
}

main().catch((err: unknown) => {
  if (err instanceof ZeroGError) {
    console.error(`\n${err.name}: ${err.message}`);
    if ("hint" in err && typeof err.hint === "string") {
      console.error(`Hint: ${err.hint}`);
    }
    if ("helpUrl" in err && typeof err.helpUrl === "string") {
      console.error(`Help: ${err.helpUrl}`);
    }
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
