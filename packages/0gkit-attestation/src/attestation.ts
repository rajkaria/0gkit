import { AttestationError, digestJson, type Signer } from "@foundryprotocol/0gkit-core";
import { hashMessage, recoverAddress, type Address, type Hex } from "viem";
import { sign } from "viem/accounts";

export interface AttestationEnvelope {
  kind: "foundry/eval-result/v1";
  forge: Address;
  scores: number[];
  baseline: number;
  teeAttestation: Hex;
  daRef?: string;
  coordinator: Address;
  timestamp: number;
}

export interface SignedEnvelope {
  envelope: AttestationEnvelope;
  digest: Hex;
  signature: Hex;
}

export interface VerifyResult {
  ok: boolean;
  checks: { digest: boolean; signer: boolean };
  signer: Address;
}

/** Validate + narrow an unknown value into an AttestationEnvelope. */
export function parseEnvelope(value: unknown): AttestationEnvelope {
  const e = value as Partial<AttestationEnvelope> | null;
  const bad = (why: string): never => {
    throw new AttestationError(
      `Invalid attestation envelope: ${why}.`,
      `Envelope must match the foundry/eval-result/v1 shape.`
    );
  };
  if (!e || typeof e !== "object") bad("not an object");
  if (e!.kind !== "foundry/eval-result/v1") bad("kind");
  if (typeof e!.forge !== "string") bad("forge");
  if (
    !Array.isArray(e!.scores) ||
    e!.scores.some((n) => typeof n !== "number" || !Number.isFinite(n))
  )
    bad("scores");
  if (typeof e!.baseline !== "number" || !Number.isFinite(e!.baseline)) bad("baseline");
  if (typeof e!.teeAttestation !== "string") bad("teeAttestation");
  if (typeof e!.coordinator !== "string") bad("coordinator");
  if (typeof e!.timestamp !== "number" || !Number.isFinite(e!.timestamp))
    bad("timestamp");
  if (e!.daRef !== undefined && typeof e!.daRef !== "string") bad("daRef");
  return e as AttestationEnvelope;
}

/** keccak of the canonical envelope JSON — the on-chain anchor. */
export function digestEnvelope(envelope: AttestationEnvelope): Hex {
  return digestJson(envelope);
}

/** EIP-191 personal-sign over the digest (matches on-chain ecrecover). */
export async function signEnvelope(
  envelope: AttestationEnvelope,
  privateKey: Hex | string
): Promise<SignedEnvelope> {
  const digest = digestEnvelope(envelope);
  const pk = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as Hex;
  let signature: Hex;
  try {
    signature = await sign({
      hash: hashMessage({ raw: digest }),
      privateKey: pk,
      to: "hex",
    });
  } catch {
    throw new AttestationError(
      "signEnvelope: invalid privateKey.",
      "Provide a 64-char hex private key (with or without 0x), e.g. the output of `cast wallet new`."
    );
  }
  return { envelope, digest, signature };
}

/**
 * Sign an attestation envelope using the Signer abstraction from
 * `@foundryprotocol/0gkit-wallet`. Works with any loader:
 * `fromPrivateKey`, `fromFile`, `fromEnv`, `fromKMS`, or a wagmi connector.
 *
 * The EIP-191 personal-sign is applied over the raw digest (matching
 * `signEnvelope` exactly), so `verifyEnvelope` round-trips correctly.
 */
export async function signEnvelopeWithSigner(
  envelope: AttestationEnvelope,
  signer: Signer
): Promise<SignedEnvelope> {
  const digest = digestEnvelope(envelope);
  const signature = await signer.signMessage({ raw: digest });
  return { envelope, digest, signature };
}

export async function recoverSigner(
  signed: Pick<SignedEnvelope, "digest" | "signature">
): Promise<Address> {
  return recoverAddress({
    hash: hashMessage({ raw: signed.digest }),
    signature: signed.signature,
  });
}

/**
 * Verify digest integrity AND signer identity. Never throws (a malformed
 * signature yields ok:false). When checks.digest is false, checks.signer is
 * reported false without attempting recovery (signer check is skipped, not
 * "wrong signer").
 */
export async function verifyEnvelope(
  signed: SignedEnvelope,
  expectedSigner: Address | string
): Promise<VerifyResult> {
  const recomputed = digestEnvelope(signed.envelope);
  const digestOk = recomputed.toLowerCase() === signed.digest.toLowerCase();
  let signer = "0x0000000000000000000000000000000000000000" as Address;
  let signerOk = false;
  try {
    signer = await recoverSigner(signed);
    signerOk = digestOk && signer.toLowerCase() === expectedSigner.toLowerCase();
  } catch {
    signerOk = false;
  }
  return {
    ok: digestOk && signerOk,
    checks: { digest: digestOk, signer: signerOk },
    signer,
  };
}

/** Human-readable multi-line summary for CLIs / logs. */
export function reportEnvelope(signed: SignedEnvelope): string {
  const e = signed.envelope;
  return [
    `attestation ${e.kind}`,
    `  forge        ${e.forge}`,
    `  coordinator  ${e.coordinator}`,
    `  scores       [${e.scores.join(", ")}]  baseline ${e.baseline}`,
    `  timestamp    ${new Date(e.timestamp * 1000).toISOString()}`,
    `  teeAttest    ${e.teeAttestation}`,
    e.daRef ? `  daRef        ${e.daRef}` : `  daRef        (none)`,
    `  digest       ${signed.digest}`,
    `  signature    ${signed.signature.slice(0, 22)}…`,
  ].join("\n");
}
