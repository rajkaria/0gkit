import type { Signer } from "@foundryprotocol/0gkit-core";

/**
 * Convenience pass-through to `signer.signMessage(bytes)`. Useful for the
 * minority of chain-side flows (faucet requests, attestation submissions
 * that don't go through the attestation primitive) where you want a one-liner
 * over the Signer interface without importing the full wallet package.
 */
export async function signMessageWith(
  signer: Signer,
  bytes: string | Uint8Array | { raw: `0x${string}` | Uint8Array }
): Promise<`0x${string}`> {
  return signer.signMessage(bytes);
}
