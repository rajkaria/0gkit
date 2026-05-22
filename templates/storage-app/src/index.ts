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
import { fromEnv } from "@foundryprotocol/0gkit-wallet";
import { ZeroGError, formatEstimate } from "@foundryprotocol/0gkit-core";
import { runStorageFlow } from "./storage-flow.js";

async function main(): Promise<void> {
  const signer = await fromEnv();
  const network = (process.env.ZEROG_NETWORK ?? "galileo") as "galileo" | "aristotle";
  const storage = new Storage({ network, signer });

  const samplePath = fileURLToPath(new URL("./index.ts", import.meta.url));
  const bytes = new Uint8Array(await readFile(samplePath));

  const result = await runStorageFlow(
    { bytes, label: samplePath },
    {
      storage,
      log: (m) => console.log(m),
      formatEstimate,
    }
  );

  if (!result.ok) {
    console.error(`FAILED: ${result.reason}`);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  if (err instanceof ZeroGError) {
    console.error(`\n${err.name}: ${err.message}`);
    if ("hint" in err && typeof err.hint === "string") {
      console.error(`Hint: ${err.hint}`);
    }
  } else {
    console.error(err);
  }
  process.exit(1);
});
