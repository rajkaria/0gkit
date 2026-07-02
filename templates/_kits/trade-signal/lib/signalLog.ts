/**
 * trade-signal — portable core: attested signal receipt
 *
 * Dependency-free: accepts injected { attestor, storage } so this lib works on
 * every base and is fully unit-testable with mocks.
 *
 * HONESTY INVARIANTS
 * ──────────────────
 * - This lib records a SIGNAL (an advisory recommendation) with an attested
 *   receipt. It does NOT execute any transaction and does NOT move value.
 * - The public surface contains NO execute/trade/swap/send/transfer.
 * - `logSignal` persists a signed record to 0G Storage (audit trail).
 * - `attestSignal` signs + verifies a signal receipt WITHOUT storing it
 *   (used by the mcp-agent tool, where the caller keeps the receipt).
 *
 * Attestation honesty seam
 * ─────────────────────────
 * The Attestor interface is abstract. The default adapter implements a SIGNED
 * RECEIPT: the operator key signs a canonical digest of the signal receipt via
 * EIP-191 personal-sign (same mechanism as 0gkit-attestation internally). The
 * badge means "this signal was signed by the operator key and the digest
 * matches" — NOT TEE-quote verification. A real TEE-quote verifier can slot in
 * via the same interface without changing this lib.
 */

import { createHash } from "node:crypto";
import type { SignalAction } from "./signal.js";

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
  /** Sign the signal receipt; returns digest and signature. */
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
 * The signal to record. This is a RECORD of an advisory recommendation — not
 * an instruction to the system to execute anything.
 */
export interface SignalLogInput {
  /** Asset the signal concerns, e.g. "ETH". */
  asset: string;
  /** Advisory action: buy / sell / hold. */
  action: SignalAction;
  /** Confidence in [0, 1] from the analysis. */
  confidence: number;
  /** Plain-text rationale from the analysis. */
  rationale: string;
}

/**
 * The canonical receipt object that is attested (signed).
 * Verifiers reconstruct and verify by passing this to attestor.verify().
 */
export interface SignalReceipt {
  asset: string;
  action: SignalAction;
  confidence: number;
  rationale: string;
  ts: number;
}

/**
 * The full record returned by logSignal — everything needed to verify the
 * attestation offline and retrieve the record from 0G Storage.
 */
export interface SignalRecord {
  /** Unique ID for this log entry. */
  id: string;
  /** Original signal input. */
  input: SignalLogInput;
  /**
   * The exact receipt object that was signed. Pass back to attestor.verify()
   * for offline verification — do NOT reconstruct it (ts is a one-time value).
   */
  receipt: SignalReceipt;
  /**
   * Signed receipt: operator-signed digest of the signal receipt.
   * Badge: "✓ signature verified" — NOT TEE-quote verification.
   */
  attestation: { digest: string; signature: string };
  /** 0G Storage root where the full record JSON is persisted (content-addressed). */
  storageRef: string;
  /** Unix timestamp (ms) when the record was created. */
  ts: number;
}

/**
 * Result of attestSignal — a signed + verified signal receipt with NO storage.
 * `verified` reflects the REAL verify() outcome — never hardcoded.
 */
export interface SealedSignal {
  /** The exact receipt object that was signed. */
  receipt: SignalReceipt;
  /** Operator-signed digest of the receipt. */
  attestation: { digest: string; signature: string };
  /**
   * Whether the signature verified against the expected signer.
   * NOT TEE-quote verification — means the expected operator key signed it.
   */
  verified: boolean;
}

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface LogSignalDeps {
  /** Attestor for signing the signal receipt. See Attestor for honesty notes. */
  attestor: Attestor;
  /** Content-addressed storage client. Adapters wire real 0G Storage. */
  storage: StorageClient;
}

export interface AttestSignalDeps {
  /** Attestor for signing + verifying the signal receipt. */
  attestor: Attestor;
}

// ---------------------------------------------------------------------------
// Internal helpers (no external deps)
// ---------------------------------------------------------------------------

function generateId(prefix: string): string {
  const ts = Date.now().toString(16);
  const rand = createHash("sha256")
    .update(`${prefix}:${ts}:${Math.random()}`)
    .digest("hex")
    .slice(0, 8);
  return `${prefix}-${ts}-${rand}`;
}

/** Build the canonical receipt object that is signed. */
function makeReceipt(input: SignalLogInput, ts: number): SignalReceipt {
  return {
    asset: input.asset,
    action: input.action,
    confidence: input.confidence,
    rationale: input.rationale,
    ts,
  };
}

// ---------------------------------------------------------------------------
// logSignal — sign + store; no tx
// ---------------------------------------------------------------------------

/**
 * Records a signal with an attested receipt persisted to 0G Storage.
 *
 * IMPORTANT: This function does NOT execute any transaction. It records the
 * advisory signal with a signed attestation for auditability.
 *
 * Flow: build canonical receipt → sign via attestor → assemble record →
 * JSON-encode → upload to storage → return record with storageRef.
 *
 * @param input  The signal to record.
 * @param deps   Injected attestor + storage.
 * @returns      The full attested SignalRecord.
 */
export async function logSignal(
  input: SignalLogInput,
  deps: LogSignalDeps
): Promise<SignalRecord> {
  const ts = Date.now();
  const id = generateId("signal");
  const receipt = makeReceipt(input, ts);

  // Sign the receipt (SIGNED RECEIPT — not TEE-quote verification)
  const attestation = await deps.attestor.sign(receipt);

  const record: SignalRecord = {
    id,
    input,
    receipt,
    attestation,
    storageRef: "", // filled after upload
    ts,
  };

  const encoded = new TextEncoder().encode(JSON.stringify(record));
  const { root } = await deps.storage.upload(encoded);

  return { ...record, storageRef: root };
}

// ---------------------------------------------------------------------------
// attestSignal — sign + verify; no storage, no tx
// ---------------------------------------------------------------------------

/**
 * Signs a signal receipt and verifies the signature against `expectedSigner`,
 * WITHOUT persisting anything. Used where the caller keeps the receipt (e.g.
 * the mcp-agent tool).
 *
 * NEVER throws on a bad/tampered signature — verify failure => verified:false.
 *
 * @param input           The signal to attest.
 * @param deps            Injected attestor.
 * @param expectedSigner  The operator address whose signature we verify against.
 * @returns               { receipt, attestation, verified }.
 */
export async function attestSignal(
  input: SignalLogInput,
  deps: AttestSignalDeps,
  expectedSigner: string
): Promise<SealedSignal> {
  const ts = Date.now();
  const receipt = makeReceipt(input, ts);

  const attestation = await deps.attestor.sign(receipt);

  let verified = false;
  try {
    const result = await deps.attestor.verify(receipt, attestation, expectedSigner);
    verified = result.ok;
  } catch {
    verified = false;
  }

  return { receipt, attestation, verified };
}
