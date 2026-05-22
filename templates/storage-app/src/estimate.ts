/**
 * Standalone estimator — prints the upload cost without touching the network
 * beyond a Merkle root computation. Useful for budgeting before a deploy.
 *
 * Usage: pnpm estimate <path-to-file>
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Storage } from "@foundryprotocol/0gkit-storage";
import { fromEnv } from "@foundryprotocol/0gkit-wallet";
import { formatEstimate } from "@foundryprotocol/0gkit-core";

async function main(): Promise<void> {
  const [pathArg] = process.argv.slice(2);
  if (!pathArg) {
    console.error("Usage: pnpm estimate <path-to-file>");
    process.exit(2);
  }
  const signer = await fromEnv();
  const network = (process.env.ZEROG_NETWORK ?? "galileo") as "galileo" | "aristotle";
  const storage = new Storage({ network, signer });

  const bytes = new Uint8Array(await readFile(resolve(pathArg)));
  const est = await storage.estimate(bytes);
  console.log(`Estimate for ${pathArg} (${bytes.length} bytes):`);
  console.log(formatEstimate(est));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
