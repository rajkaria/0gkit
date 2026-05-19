import {
  verifyEnvelope,
  type SignedEnvelope,
  type VerifyResult,
} from "@foundryprotocol/0gkit-attestation";
import { useAsyncAction } from "./internal.js";
import type { AsyncState } from "./types.js";

export interface UseAttestationResult extends AsyncState<VerifyResult> {
  /**
   * Verify a signed attestation envelope against the expected signer.
   * Never throws for a bad signature — resolves with `ok:false` instead.
   */
  verify: (signed: SignedEnvelope, expectedSigner: string) => Promise<VerifyResult>;
  reset: () => void;
}

/** Verify a signed attestation envelope (pure; no network, no keys). */
export function useAttestation(): UseAttestationResult {
  const { data, error, loading, run, reset } = useAsyncAction(
    (signed: SignedEnvelope, expectedSigner: string) =>
      verifyEnvelope(signed, expectedSigner)
  );
  return { data, error, loading, verify: run, reset };
}
