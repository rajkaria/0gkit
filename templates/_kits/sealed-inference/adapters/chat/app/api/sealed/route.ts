/**
 * sealed-inference — chat adapter
 *
 * Next.js App Router route handler for sealed inference.
 *
 * POST /api/sealed   — run a sealed inference query
 *   Body: { "prompt": "...", "model"?: "..." }
 *
 * Response:
 *   { text, receipt, attestation: { digest, signature }, verified: boolean }
 *
 * Attestation honesty
 * ────────────────────
 * The attestation is a SIGNED RECEIPT — the operator key (OG_PRIVATE_KEY) signs
 * a canonical digest of the inference receipt via EIP-191 personal-sign (same
 * mechanism 0gkit-attestation uses internally). Badge: "✓ signature verified" —
 * NOT TEE-quote verification. A real TEE-quote verifier can replace this Attestor
 * without changing the portable lib.
 *
 * Environment variables (set in .env.local):
 *   OG_PRIVATE_KEY         — 0x-prefixed private key (operator signer)
 *   OG_RPC_URL             — 0G chain RPC URL
 *   OG_COMPUTE_MODEL       — model override (optional)
 *   OG_ATTESTOR_ADDRESS    — expected signer address (what verify checks against)
 */

// NOTE: Adapters MAY import 0gkit packages.
import { Compute } from "@foundryprotocol/0gkit-compute";
import { digestJson } from "@foundryprotocol/0gkit-core";
import { fromPrivateKey } from "@foundryprotocol/0gkit-wallet";
import { recoverSigner } from "@foundryprotocol/0gkit-attestation";
import { NextRequest, NextResponse } from "next/server";

import { sealedInfer, type Attestor } from "../../../lib/sealed.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPrivateKey(): `0x${string}` {
  const key = process.env.OG_PRIVATE_KEY;
  if (!key) throw new Error("Missing OG_PRIVATE_KEY environment variable.");
  return key as `0x${string}`;
}

function getAttestorAddress(): string {
  const addr = process.env.OG_ATTESTOR_ADDRESS;
  if (!addr) throw new Error("Missing OG_ATTESTOR_ADDRESS environment variable.");
  return addr;
}

// ---------------------------------------------------------------------------
// Attestor: signed receipt
// Sign: signer.signMessage({raw: digestJson(receipt)}) — EIP-191 personal-sign
// Verify: recompute digest, recover signer via recoverSigner from 0gkit-attestation
// Badge: "✓ signature verified" — NOT TEE-quote verification.
// ---------------------------------------------------------------------------

async function buildAttestor(privateKey: `0x${string}`): Promise<Attestor> {
  const signer = await fromPrivateKey(privateKey);

  return {
    async sign(receipt: unknown): Promise<{ digest: string; signature: string }> {
      const digest = digestJson(receipt);
      // EIP-191 personal-sign over the raw keccak digest (same as 0gkit-attestation internals)
      const signature = await signer.signMessage({ raw: digest });
      return { digest, signature };
    },

    async verify(
      receipt: unknown,
      signed: { digest: string; signature: string },
      expectedSigner: string
    ): Promise<{ ok: boolean; signer: string }> {
      const recomputed = digestJson(receipt);
      const digestMatch = recomputed.toLowerCase() === signed.digest.toLowerCase();
      const recovered = await recoverSigner({
        digest: signed.digest as `0x${string}`,
        signature: signed.signature as `0x${string}`,
      });
      return {
        ok: digestMatch && recovered.toLowerCase() === expectedSigner.toLowerCase(),
        signer: recovered,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// POST /api/sealed
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { prompt, model } = body as { prompt?: unknown; model?: unknown };
    if (typeof prompt !== "string" || !prompt) {
      return NextResponse.json(
        { error: '"prompt" must be a non-empty string' },
        { status: 400 }
      );
    }

    const privateKey = getPrivateKey();
    const attestorAddress = getAttestorAddress();

    // Build signer and inference client
    const signer = await fromPrivateKey(privateKey);
    const compute = new Compute({ signer });

    const inferClient = {
      async infer(args: { prompt: string; model?: string }) {
        const result = await compute.inference({
          messages: [{ role: "user" as const, content: args.prompt }],
          ...(args.model ? { model: args.model } : {}),
        });
        return { output: result.output };
      },
    };

    // Build attestor (signed receipt — NOT TEE-quote verification)
    const attestor = await buildAttestor(privateKey);

    // Run sealed inference
    const result = await sealedInfer(
      {
        infer: inferClient,
        attestor,
        model: typeof model === "string" ? model : process.env.OG_COMPUTE_MODEL,
      },
      prompt,
      attestorAddress
    );

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
