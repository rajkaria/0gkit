import type { Estimate, DryRunResult, Receipt } from "@foundryprotocol/0gkit-core";

export interface UploadResult {
  root: string;
  tx: Receipt;
  raw: unknown;
}

export interface StorageFlowDeps {
  storage: {
    upload(data: Uint8Array): Promise<UploadResult>;
    upload(
      data: Uint8Array,
      opts: { dryRun: true }
    ): Promise<DryRunResult<UploadResult>>;
    download(root: string): Promise<Uint8Array>;
    exists(root: string): Promise<boolean>;
  };
  log: (m: string) => void;
  formatEstimate: (e: Estimate) => string;
}

export interface StorageFlowInput {
  bytes: Uint8Array;
  label: string;
}

export type StorageFlowResult =
  | {
      ok: true;
      root: string;
      txHash: string;
      latencyMs: number;
      dedup: boolean;
    }
  | { ok: false; reason: string };

/**
 * Upload-then-verify with dry-run preflight + dedup.
 *
 * 1. Dry-run to surface the estimate + predicted Merkle root.
 * 2. Skip the funding tx if the predicted root already exists upstream.
 * 3. Live upload; print the funding tx receipt.
 * 4. Download by root and assert byte-for-byte equality.
 */
export async function runStorageFlow(
  { bytes, label }: StorageFlowInput,
  deps: StorageFlowDeps
): Promise<StorageFlowResult> {
  const { storage, log, formatEstimate } = deps;

  log(`Read ${bytes.length} bytes from ${label}`);

  const dry = await storage.upload(bytes, { dryRun: true });
  log("");
  log("Dry-run estimate:");
  log(formatEstimate(dry.estimate));
  log(`  predicted root: ${dry.result.root}`);

  const dryRoot = dry.result.root;
  let dedup = false;
  if (await storage.exists(dryRoot)) {
    log("");
    log(`Dedup: ${dryRoot} already on 0G Storage — skipping broadcast.`);
    dedup = true;
    return { ok: true, root: dryRoot, txHash: "", latencyMs: 0, dedup };
  }

  log("");
  log("Uploading…");
  const live = await storage.upload(bytes);
  const txHash = live.tx.txHash ?? "";
  const latencyMs = live.tx.latencyMs ?? 0;
  log(`  Merkle root : ${live.root}`);
  log(`  tx hash     : ${txHash}`);
  log(`  latency     : ${latencyMs}ms`);

  log("Downloading back…");
  const fetched = await storage.download(live.root);
  log(`  Got ${fetched.length} bytes`);

  const ok =
    fetched.length === bytes.length && fetched.every((b, i) => b === bytes[i]);
  if (!ok) return { ok: false, reason: "round-trip bytes did not match" };

  log("Round-trip OK.");
  return { ok: true, root: live.root, txHash, latencyMs, dedup };
}
