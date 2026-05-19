/**
 * storage-app — round-trip a file through 0G Storage.
 *
 * 1. Read a local file into memory.
 * 2. Upload it to 0G Storage (prints the Merkle root + funding tx receipt).
 * 3. Download it back by root.
 * 4. Verify the downloaded bytes are byte-for-byte identical.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Storage } from "@foundryprotocol/0gkit-storage";
import { ZeroGError } from "@foundryprotocol/0gkit-core";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return v;
}

async function main(): Promise<void> {
  const privateKey = requireEnv("PRIVATE_KEY");
  const network = (process.env.ZEROG_NETWORK ?? "galileo") as "galileo" | "aristotle";

  // Use this very source file as the sample payload to upload.
  const samplePath = fileURLToPath(new URL("./index.ts", import.meta.url));
  const original = new Uint8Array(await readFile(samplePath));
  console.log(`Read ${original.length} bytes from ${samplePath}`);

  const storage = new Storage({ network, privateKey });

  console.log(`Uploading to 0G Storage (${network})…`);
  const { root, tx } = await storage.upload(original);
  console.log(`  Merkle root : ${root}`);
  console.log(`  tx hash     : ${tx.txHash}`);
  console.log(`  latency     : ${tx.latencyMs}ms`);

  console.log(`Downloading ${root} back…`);
  const fetched = await storage.download(root);
  console.log(`  Got ${fetched.length} bytes`);

  const identical =
    fetched.length === original.length && fetched.every((b, i) => b === original[i]);

  if (!identical) {
    console.error("Round-trip FAILED: downloaded bytes differ from original.");
    process.exit(1);
  }
  console.log("Round-trip OK: downloaded bytes match the original.");
}

main().catch((err: unknown) => {
  if (err instanceof ZeroGError) {
    console.error(`\n${err.name}: ${err.message}`);
    if (err.hint) console.error(`Hint: ${err.hint}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
