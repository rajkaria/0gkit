import { type Estimate, ZeroGError } from "@foundryprotocol/0gkit-core";

/**
 * Segment size used by 0G storage's Merkle-tree chunking. 256 KiB matches the
 * default chunk size in @0gfoundation/0g-storage-ts-sdk. Documented so callers
 * can interpret estimates without reading the SDK.
 */
export const SEGMENT_SIZE_BYTES = 256 * 1024;

/**
 * Rough per-segment gas heuristic — covers the SDK's `submit` call's per-segment
 * calldata + per-segment storage write cost. The real network's gas curve will
 * vary by congestion; this gives builders an order-of-magnitude answer.
 */
const GAS_PER_SEGMENT = 80_000n;
const GAS_BASE = 21_000n;

/** Galileo currently bills storage at ~1 gwei per segment (placeholder). */
const FEE_PER_SEGMENT_WEI = 1_000_000_000n;

export interface StorageEstimateBreakdown {
  readonly sizeBytes: number;
  readonly segments: number;
  readonly [k: string]: string | number | bigint | undefined;
}

export interface StorageEstimate extends Estimate {
  readonly kind: "storage";
  readonly breakdown: StorageEstimateBreakdown;
}

export function estimateBytes(sizeBytes: number): StorageEstimateBreakdown {
  if (sizeBytes < 0) {
    throw new ZeroGError(
      "STORAGE_INVALID_BYTES",
      "sizeBytes must be ≥ 0",
      "Pass a non-negative integer for sizeBytes (the number of bytes you intend to upload)."
    );
  }
  const segments = sizeBytes === 0 ? 0 : Math.ceil(sizeBytes / SEGMENT_SIZE_BYTES);
  return { sizeBytes, segments };
}

export function makeStorageEstimate(sizeBytes: number): StorageEstimate {
  const breakdown = estimateBytes(sizeBytes);
  const gas = GAS_BASE + BigInt(breakdown.segments) * GAS_PER_SEGMENT;
  const fee = BigInt(breakdown.segments) * FEE_PER_SEGMENT_WEI;
  return {
    kind: "storage",
    gas,
    fee,
    breakdown,
    expectedSeconds: 8,
  };
}
