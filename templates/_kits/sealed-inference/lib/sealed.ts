/**
 * sealed-inference — portable core
 *
 * Dependency-free: accepts injected { infer, attestor } so this lib
 * works on every base and is fully unit-testable with mocks.
 *
 * Attestation honesty seam
 * ─────────────────────────
 * The Attestor interface is intentionally abstract. The default adapter
 * implements a SIGNED RECEIPT: the operator key signs a canonical digest of
 * the inference receipt and verify() recovers the signer. This is NOT
 * TEE-quote verification — the badge means "the digest matches and the
 * expected operator signed it." A real TEE-quote verifier can slot in later
 * by implementing the same Attestor interface without any change to this lib.
 *
 * sealedInfer never throws on a bad/tampered signature — verify failure => verified:false.
 */

// ---------------------------------------------------------------------------
// Injected interfaces (adapters and tests provide implementations)
// ---------------------------------------------------------------------------

/**
 * Thin wrapper around the compute provider. Adapters wire the real
 * @foundryprotocol/0gkit-compute Compute.inference here.
 */
export interface InferenceClient {
  infer(args: { prompt: string; model?: string }): Promise<{ output: string }>;
}

/**
 * Signed-receipt attestor.
 *
 * Default impl: operator private key signs digestJson(receipt) via EIP-191
 * personal-sign (same mechanism as 0gkit-attestation uses internally).
 * Badge meaning: "signature verified" -- the receipt digest matches and the
 * expected operator address signed it. NOT a TEE-quote verification.
 *
 * Replace this interface with a real TEE-quote verifier when one is available.
 */
export interface Attestor {
  /** Sign the inference receipt; returns the digest and signature. */
  sign(receipt: unknown): Promise<{ digest: string; signature: string }>;
  /**
   * Verify a previously-signed receipt.
   * Returns { ok, signer } -- never throws.
   */
  verify(
    receipt: unknown,
    signed: { digest: string; signature: string },
    expectedSigner: string
  ): Promise<{ ok: boolean; signer: string }>;
}

// ---------------------------------------------------------------------------
// SealedDeps
// ---------------------------------------------------------------------------

export interface SealedDeps {
  /** Compute inference client. */
  infer: InferenceClient;
  /**
   * Attestor for signing the inference receipt.
   * See the Attestor interface for honesty notes.
   */
  attestor: Attestor;
  /** Optional model to pass to the inference client. */
  model?: string;
}

// ---------------------------------------------------------------------------
// SealedReceipt -- the canonical receipt object that is signed
// ---------------------------------------------------------------------------

export interface SealedReceipt {
  prompt: string;
  text: string;
  ts: number;
}

// ---------------------------------------------------------------------------
// SealedResult
// ---------------------------------------------------------------------------

export interface SealedResult {
  /** The raw text output from the inference provider. */
  text: string;
  /**
   * The exact receipt object that was signed. Verifiers must pass this back
   * to attestor.verify() -- do NOT reconstruct it, as ts is a one-time value.
   */
  receipt: SealedReceipt;
  /** Signed receipt: the operator-signed digest of the inference receipt. */
  attestation: { digest: string; signature: string };
  /**
   * Whether the signature was successfully verified against expectedSigner.
   * true  -- verified (receipt digest matches + expected operator signed it)
   * false -- unverified (digest mismatch, wrong signer, or verify threw)
   *
   * This is NOT TEE-quote verification. It means the expected operator key signed
   * the inference receipt. A real TEE-quote verifier can replace the Attestor seam.
   */
  verified: boolean;
}

// ---------------------------------------------------------------------------
// sealedInfer
// ---------------------------------------------------------------------------

/**
 * Run a sealed inference: infer -> build receipt -> sign -> verify -> return.
 *
 * @param deps       Injected dependencies (infer, attestor).
 * @param prompt     The prompt to send to the inference provider.
 * @param expectedSigner The operator address whose signature we verify against.
 * @returns SealedResult with text, signed receipt, and verified flag.
 *
 * IMPORTANT: This function NEVER throws on a bad or tampered signature.
 * Verification failure produces { verified: false } -- the caller (UI) renders
 * the badge state accordingly.
 */
export async function sealedInfer(
  deps: SealedDeps,
  prompt: string,
  expectedSigner: string
): Promise<SealedResult> {
  // 1. Run inference
  const { output } = await deps.infer.infer({
    prompt,
    model: deps.model,
  });

  // 2. Build the inference receipt (what gets signed)
  //    This is a canonical object -- the exact ts value matters for verification.
  const receipt: SealedReceipt = {
    prompt,
    text: output,
    ts: Date.now(),
  };

  // 3. Sign the receipt (SIGNED RECEIPT -- not TEE-quote verification)
  const attestation = await deps.attestor.sign(receipt);

  // 4. Verify the signed receipt against the expected signer.
  //    Wrapped in try/catch: verify failure MUST NOT throw -- return verified:false.
  let verified = false;
  try {
    const result = await deps.attestor.verify(receipt, attestation, expectedSigner);
    verified = result.ok;
  } catch {
    // Treat any verify error as a failed verification, not a thrown exception.
    verified = false;
  }

  return {
    text: output,
    receipt,
    attestation,
    verified,
  };
}
