import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Network } from "./types.js";

/**
 * Default environment values for a freshly-scaffolded app, keyed by network.
 *
 * `local` matches the ports exposed by `0g dev` (SP2).
 * `galileo` points at the public 0G testnet RPC + storage indexer.
 */
export function envFor(network: Network): Record<string, string> {
  if (network === "local") {
    return {
      NETWORK: "local",
      RPC_URL: "http://127.0.0.1:8545",
      STORAGE_URL: "http://127.0.0.1:5678",
      COMPUTE_URL: "http://127.0.0.1:5679",
      DA_URL: "http://127.0.0.1:5680",
      PRIVATE_KEY: "",
    };
  }
  return {
    NETWORK: "galileo",
    RPC_URL: "https://evmrpc-testnet.0g.ai",
    STORAGE_URL: "https://indexer-storage-testnet-turbo.0g.ai",
    COMPUTE_URL: "",
    DA_URL: "",
    PRIVATE_KEY: "",
  };
}

export function writeEnvExample(opts: { network: Network; dest: string }): void {
  const env = envFor(opts.network);
  const lines: string[] = ["# 0g app — environment", `# Network: ${opts.network}`, ""];
  for (const [k, v] of Object.entries(env)) {
    if (k === "PRIVATE_KEY") {
      lines.push(
        opts.network === "local"
          ? "# Paste a private key from `0g dev` output. Never use this key in production."
          : "# Paste a Galileo-funded private key. Use a secure key loader (e.g. fromKMS) in prod."
      );
    }
    lines.push(`${k}=${v}`);
  }
  writeFileSync(join(opts.dest, ".env.example"), lines.join("\n") + "\n");
}
