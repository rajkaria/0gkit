/**
 * ai-oracle — portable core
 *
 * Dependency-free: accepts injected { infer, attestor, anchor } so the lib
 * works on every base and is fully unit-testable with mocks.
 *
 * Attestation honesty seam
 * ─────────────────────────
 * The Attestor interface is intentionally abstract. The default adapter
 * implements a SIGNED RECEIPT: the operator key signs a canonical digest of
 * the inference receipt and `verify()` recovers the signer. This is NOT
 * TEE-quote verification — the badge means "the digest matches and the
 * expected operator signed it." A real TEE-quote verifier can slot in later
 * by implementing the same Attestor interface without any change to this lib.
 *
 * Anchor honesty seam
 * ────────────────────
 * Default anchor = 0G Storage (immutable content-addressed root hash).
 * Opt-in anchor = on-chain tx via Anchor.sol (gated by OG_ANCHOR_ONCHAIN=1).
 * Never fabricate TEE/enclave claims.
 */

import { createHash } from "node:crypto";

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
 * Badge meaning: "✓ signature verified" — the receipt digest matches and the
 * expected operator address signed it. NOT a TEE-quote verification.
 *
 * Replace this interface with a real TEE-quote verifier when one is available.
 */
export interface Attestor {
  /** Sign the inference receipt; returns the digest and signature. */
  sign(receipt: unknown): Promise<{ digest: string; signature: string }>;
  /**
   * Verify a previously-signed receipt.
   * Returns { ok, signer } — never throws.
   */
  verify(
    receipt: unknown,
    signed: { digest: string; signature: string },
    expectedSigner: string
  ): Promise<{ ok: boolean; signer: string }>;
}

/**
 * Commitment anchor. Default = 0G Storage; opt-in = on-chain.
 * kind "storage" → immutable 0G Storage root (content-addressed).
 * kind "onchain" → transaction committed to the Anchor.sol contract.
 */
export interface Anchor {
  anchor(
    payload: Uint8Array | string
  ): Promise<{ ref: string; kind: "storage" | "onchain" }>;
}

// ---------------------------------------------------------------------------
// Oracle dependencies shape (passed to resolveOracle)
// ---------------------------------------------------------------------------

export interface OracleDeps {
  /** Compute inference client. */
  infer: InferenceClient;
  /**
   * Attestor for signing the inference receipt.
   * See the Attestor interface for honesty notes.
   */
  attestor: Attestor;
  /** Commitment anchor (0G Storage by default; on-chain opt-in). */
  anchor: Anchor;
  /** Optional model to pass to the inference client. */
  model?: string;
}

// ---------------------------------------------------------------------------
// OracleResult
// ---------------------------------------------------------------------------

/**
 * The canonical inference receipt shape that is signed and anchored.
 * Returned verbatim in OracleResult so verifiers can reconstruct the exact
 * object that was passed to attestor.sign() without guessing `ts`.
 */
export interface OracleReceipt {
  question: string;
  answer: string;
  answerHash: string;
  ts: number;
}

export interface OracleResult {
  /** The raw answer text from the inference provider. */
  answer: string;
  /**
   * SHA-256 hex of `answer`, prefixed with "0x".
   * Deterministic: same answer → same hash.
   */
  answerHash: string;
  /**
   * The exact receipt object that was signed. Verifiers must pass this back
   * to attestor.verify() — do NOT reconstruct it, as `ts` is a one-time value.
   */
  receipt: OracleReceipt;
  /** Signed receipt: the operator-signed digest of the inference receipt. */
  attestation: { digest: string; signature: string };
  /** Anchor commitment: where the signed receipt is anchored. */
  commitment: { ref: string; kind: "storage" | "onchain" };
}

// ---------------------------------------------------------------------------
// resolveOracle
// ---------------------------------------------------------------------------

/**
 * Run an AI oracle query: infer → hash → attest → anchor → return.
 *
 * @param deps Injected dependencies (infer, attestor, anchor).
 * @param question The question to send to the inference provider.
 * @returns OracleResult with answer, hash, signed attestation, and commitment.
 */
export async function resolveOracle(
  deps: OracleDeps,
  question: string
): Promise<OracleResult> {
  // 1. Run inference
  const { output } = await deps.infer.infer({
    prompt: question,
    model: deps.model,
  });

  // 2. Hash the answer (SHA-256, hex, 0x-prefixed)
  const answerHash = "0x" + createHash("sha256").update(output, "utf8").digest("hex");

  // 3. Build the inference receipt (what gets signed and anchored)
  //    This is a canonical object — adapters must not alter its shape
  //    since the digest is computed from it deterministically.
  const receipt = {
    question,
    answer: output,
    answerHash,
    ts: Date.now(),
  };

  // 4. Sign the receipt (SIGNED RECEIPT — not TEE-quote verification)
  const attestation = await deps.attestor.sign(receipt);

  // 5. Anchor the signed receipt payload to 0G Storage (or on-chain opt-in)
  //    Encode as JSON string so it's human-readable and content-addressed.
  const anchorPayload = JSON.stringify({
    receipt,
    attestation,
  });
  const commitment = await deps.anchor.anchor(anchorPayload);

  return {
    answer: output,
    answerHash,
    receipt,
    attestation,
    commitment,
  };
}
