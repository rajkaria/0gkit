import { type Estimate, ZeroGError } from "@foundryprotocol/0gkit-core";

/**
 * Placeholder rate for 0G DA pricing. Real on-chain pricing is not yet
 * published as a programmatic feed; this gives builders the right
 * order-of-magnitude (~1 nano-0G/byte ≈ $0.000_x per KB). When the encoder
 * exposes a metadata endpoint we'll honour that and fall back to this.
 */
export const DEFAULT_DA_RATE_WEI_PER_BYTE = 1_000_000n;

export interface DAEstimateBreakdown {
  readonly sizeBytes: number;
  readonly mode: "live" | "local";
  readonly [k: string]: string | number | bigint | undefined;
}

export interface DAEstimate extends Estimate {
  readonly kind: "da";
  readonly breakdown: DAEstimateBreakdown;
}

/** Pure: bytes → estimate. `mode: "local"` yields fee 0. */
export function estimateBytes(
  sizeBytes: number,
  ratePerByte: bigint = DEFAULT_DA_RATE_WEI_PER_BYTE,
  mode: "live" | "local" = "live"
): DAEstimate {
  if (sizeBytes < 0) {
    throw new ZeroGError(
      "DA_INVALID_PAYLOAD",
      "sizeBytes must be ≥ 0",
      "Pass a non-negative integer for sizeBytes (the encoded payload length in bytes)."
    );
  }
  const fee = mode === "local" ? 0n : BigInt(sizeBytes) * ratePerByte;
  return {
    kind: "da",
    gas: 0n,
    fee,
    breakdown: { sizeBytes, mode },
    expectedSeconds: 4,
  };
}
