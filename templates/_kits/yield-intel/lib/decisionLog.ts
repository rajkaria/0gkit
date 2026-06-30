/**
 * yield-intel — portable core: attested decision log
 *
 * Dependency-free: accepts injected { attestor, storage } so this lib works
 * on every base and is fully unit-testable with mocks.
 *
 * HONESTY INVARIANTS
 * ──────────────────
 * - This lib logs a DECISION (the user's intended action) with an attested
 *   record written to 0G Storage. It does NOT execute any transaction.
 * - The logged action is a free-text description of what the USER plans to do
 *   manually — not something this system does automatically.
 * - The public surface contains NO execute/trade/swap/send/transfer.
 *
 * Attestation honesty seam
 * ─────────────────────────
 * The Attestor interface is abstract. The default adapter implements a SIGNED
 * RECEIPT: the operator key signs a canonical digest of the decision receipt
 * via EIP-191 personal-sign (same mechanism as 0gkit-attestation internally).
 * The badge means "this decision record was signed by the operator key and the
 * digest matches" — NOT TEE-quote verification. A real TEE-quote verifier can
 * slot in via the same interface without changing this lib.
 *
 * Storage model
 * ──────────────
 * Each decision is uploaded as an immutable JSON blob to injected storage.
 * The returned storageRef is the content-addressed root from 0G Storage (or
 * mock root in tests). The record is self-contained: consumer can retrieve it
 * by root and verify the attestation offline.
 */

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Injected interfaces
// ---------------------------------------------------------------------------

/**
 * Signed-receipt attestor.
 *
 * Default impl: operator private key signs digestJson(receipt) via EIP-191
 * personal-sign. Badge: "✓ signature verified" — NOT TEE-quote verification.
 * Replace with a real TEE-quote verifier without changing this lib.
 */
export interface Attestor {
  /** Sign the decision receipt; returns digest and signature. */
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
 * Minimal content-addressed storage interface.
 * Adapters wire the real @foundryprotocol/0gkit-storage Storage instance.
 */
export interface StorageClient {
  /** Upload bytes; returns the immutable content-addressed root. */
  upload(bytes: Uint8Array): Promise<{ root: string }>;
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/**
 * The decision the user wants to log.
 * This is a RECORD of an intended action — not an instruction to the system
 * to execute anything. The user executes manually.
 */
export interface DecisionInput {
  /** ID of the position this decision concerns (matches AnalysisItem.id). */
  positionId: string;
  /**
   * Free-text description of the intended action.
   * Example: "Rebalance into Aave USDC — higher yield, low volatility"
   * NOTE: This system does NOT execute this action.
   */
  action: string;
  /** Rationale for the decision. */
  rationale: string;
  /** Score from the analysis that informed this decision. */
  score: number;
}

/**
 * The canonical receipt object that is attested (signed + stored).
 * Verifiers reconstruct and verify by passing this to attestor.verify().
 */
export interface DecisionReceipt {
  positionId: string;
  action: string;
  rationale: string;
  score: number;
  ts: number;
}

/**
 * The full decision record returned by logDecision.
 * Contains all fields needed to verify the attestation offline.
 */
export interface DecisionRecord {
  /** Unique ID for this log entry. */
  id: string;
  /** Original decision input from the user. */
  input: DecisionInput;
  /**
   * The exact receipt object that was signed. Pass back to attestor.verify()
   * for offline verification — do NOT reconstruct it (ts is a one-time value).
   */
  receipt: DecisionReceipt;
  /**
   * Signed receipt: operator-signed digest of the decision receipt.
   * Badge: "✓ signature verified" — NOT TEE-quote verification.
   */
  attestation: { digest: string; signature: string };
  /**
   * 0G Storage root where the full record JSON is persisted.
   * Content-addressed — immutable reference for auditability.
   */
  storageRef: string;
  /** Unix timestamp (ms) when the record was created. */
  ts: number;
}

// ---------------------------------------------------------------------------
// DecisionLogDeps
// ---------------------------------------------------------------------------

export interface DecisionLogDeps {
  /** Attestor for signing the decision receipt. See Attestor for honesty notes. */
  attestor: Attestor;
  /** Content-addressed storage client. Adapters wire real 0G Storage. */
  storage: StorageClient;
}

// ---------------------------------------------------------------------------
// ID generation (no external deps)
// ---------------------------------------------------------------------------

function generateId(prefix: string): string {
  const ts = Date.now().toString(16);
  const rand = createHash("sha256")
    .update(`${prefix}:${ts}:${Math.random()}`)
    .digest("hex")
    .slice(0, 8);
  return `${prefix}-${ts}-${rand}`;
}

// ---------------------------------------------------------------------------
// logDecision — the only public function; read-only (no tx)
// ---------------------------------------------------------------------------

/**
 * Logs a decision record to 0G Storage with an attested receipt.
 *
 * IMPORTANT: This function does NOT execute any transaction. It records the
 * user's intended action with a signed attestation for auditability.
 *
 * Flow:
 *  1. Build the canonical DecisionReceipt (positionId, action, rationale, ts).
 *  2. Sign it via the injected attestor (signed receipt — NOT TEE-quote).
 *  3. Assemble the full DecisionRecord.
 *  4. Encode to JSON and upload to injected storage.
 *  5. Return the record (including storageRef for future retrieval).
 *
 * @param decision  The user's intended decision to log.
 * @param deps      Injected attestor + storage.
 * @returns         The full attested DecisionRecord.
 */
export async function logDecision(
  decision: DecisionInput,
  deps: DecisionLogDeps
): Promise<DecisionRecord> {
  const ts = Date.now();
  const id = generateId("decision");

  // Build the canonical receipt object (the exact object that is signed)
  const receipt: DecisionReceipt = {
    positionId: decision.positionId,
    action: decision.action,
    rationale: decision.rationale,
    score: decision.score,
    ts,
  };

  // Sign the receipt (SIGNED RECEIPT — not TEE-quote verification)
  const attestation = await deps.attestor.sign(receipt);

  // Assemble the full record
  const record: DecisionRecord = {
    id,
    input: decision,
    receipt,
    attestation,
    storageRef: "", // filled after upload
    ts,
  };

  // Encode and upload to storage (content-addressed, immutable)
  const encoded = new TextEncoder().encode(JSON.stringify(record));
  const { root } = await deps.storage.upload(encoded);

  // Return with storageRef set
  return { ...record, storageRef: root };
}
