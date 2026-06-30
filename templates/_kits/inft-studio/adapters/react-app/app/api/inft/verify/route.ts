/**
 * inft-studio — react-app adapter
 *
 * POST /api/inft/verify  — verify a provenance attestation
 *
 * Body: {
 *   "receipt": { model, prompt, contentHash, ts },
 *   "attestation": { digest, signature },
 *   "expectedSigner"?: "0x..."
 * }
 *
 * Response: { verified: boolean; signer: string }
 *   verified=true  → digest matches and the expected operator signed it.
 *   This is a SIGNED RECEIPT check — NOT a TEE-quote / enclave attestation.
 *   The operator key (OG_PRIVATE_KEY) signs the receipt digest via EIP-191
 *   personal-sign. "✓ signature verified" means the digest is intact and the
 *   signer is the expected address. It does NOT mean a TEE was involved.
 *
 * When expectedSigner is omitted the response still recovers and returns the
 * signer address; `verified` will be false (no reference address to compare).
 *
 * Environment variables (set in .env.local):
 *   OG_PRIVATE_KEY    — 0x-prefixed operator private key (used to sign; the
 *                        public address is the expected signer)
 */

import { digestJson } from "@foundryprotocol/0gkit-core";
import { fromPrivateKey } from "@foundryprotocol/0gkit-wallet";
import { recoverSigner } from "@foundryprotocol/0gkit-attestation";
import { NextRequest, NextResponse } from "next/server";

function getPrivateKey(): `0x${string}` {
  const key = process.env.OG_PRIVATE_KEY;
  if (!key) throw new Error("Missing OG_PRIVATE_KEY environment variable.");
  return key as `0x${string}`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { receipt, attestation, expectedSigner } = body as {
      receipt?: unknown;
      attestation?: { digest?: unknown; signature?: unknown };
      expectedSigner?: unknown;
    };

    if (!receipt || typeof receipt !== "object") {
      return NextResponse.json(
        { error: '"receipt" must be an object' },
        { status: 400 }
      );
    }
    if (
      !attestation ||
      typeof attestation.digest !== "string" ||
      typeof attestation.signature !== "string"
    ) {
      return NextResponse.json(
        { error: '"attestation" must have string fields "digest" and "signature"' },
        { status: 400 }
      );
    }

    // Recompute digest from the receipt and compare.
    const recomputed = digestJson(receipt);
    const digestMatch = recomputed.toLowerCase() === attestation.digest.toLowerCase();

    // Recover the signer from the signature.
    const recovered = await recoverSigner({
      digest: attestation.digest as `0x${string}`,
      signature: attestation.signature as `0x${string}`,
    });

    // If expectedSigner is not supplied, derive it from the operator key.
    let resolvedExpected: string | undefined =
      typeof expectedSigner === "string" ? expectedSigner : undefined;

    if (!resolvedExpected) {
      try {
        const signer = await fromPrivateKey(getPrivateKey());
        resolvedExpected = signer.address;
      } catch {
        // OG_PRIVATE_KEY not set — proceed without a reference address.
      }
    }

    const signerMatch = resolvedExpected
      ? recovered.toLowerCase() === resolvedExpected.toLowerCase()
      : false;

    return NextResponse.json({
      verified: digestMatch && signerMatch,
      signer: recovered,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
