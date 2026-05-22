import type { Receipt } from "@foundryprotocol/0gkit-core";
import { buildMetadata } from "./metadata.js";

export interface MintFlowInput {
  recipient: string;
  name: string;
  description: string;
  media: Uint8Array;
}

export interface UploadResultLite {
  root: string;
  tx: Receipt;
}

export interface MintFlowDeps {
  storage: {
    upload(data: Uint8Array): Promise<UploadResultLite>;
  };
  mint: (
    to: string,
    metadataRoot: `0x${string}`
  ) => Promise<{ txHash: string; latencyMs: number }>;
  log: (m: string) => void;
}

export type MintFlowResult =
  | { ok: true; mediaRoot: string; metadataRoot: string; mintTx: string }
  | { ok: false; reason: string };

/**
 * Two storage uploads (media, then metadata referencing the media root) +
 * one on-chain mint. Pure with respect to `deps`. Returns a structured
 * outcome so callers can switch on `result.ok`.
 */
export async function runMintFlow(
  input: MintFlowInput,
  deps: MintFlowDeps
): Promise<MintFlowResult> {
  const { storage, mint, log } = deps;

  let mediaRoot: string;
  try {
    const up = await storage.upload(input.media);
    mediaRoot = up.root;
    log(`Media uploaded: ${mediaRoot} (tx ${up.tx.txHash ?? "(none)"})`);
  } catch (e) {
    return { ok: false, reason: `media upload failed: ${(e as Error).message}` };
  }

  let metadataRoot: string;
  try {
    const metadata = buildMetadata({
      name: input.name,
      description: input.description,
      mediaRoot,
    });
    const bytes = new TextEncoder().encode(JSON.stringify(metadata));
    const up = await storage.upload(bytes);
    metadataRoot = up.root;
    log(`Metadata uploaded: ${metadataRoot} (tx ${up.tx.txHash ?? "(none)"})`);
  } catch (e) {
    return { ok: false, reason: `metadata upload failed: ${(e as Error).message}` };
  }

  try {
    const tx = await mint(input.recipient, metadataRoot as `0x${string}`);
    log(`Minted to ${input.recipient}: tx ${tx.txHash}`);
    return { ok: true, mediaRoot, metadataRoot, mintTx: tx.txHash };
  } catch (e) {
    return { ok: false, reason: `mint failed: ${(e as Error).message}` };
  }
}
