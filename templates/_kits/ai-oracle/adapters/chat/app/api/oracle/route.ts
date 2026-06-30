/**
 * ai-oracle — chat adapter
 *
 * Next.js App Router route handler for the AI oracle (chat base).
 * Identical in behaviour to the react-app adapter — both bases ship
 * Next.js App Router with app/api/, so the adapter is a straight copy.
 *
 * POST /api/oracle   — resolve a question through the AI oracle
 *   Body: { "question": "...", "model"?: "..." }
 *
 * Response:
 *   { answer, answerHash, receipt, attestation: { digest, signature }, commitment: { ref, kind } }
 *
 * Wires real @foundryprotocol/0gkit-* packages to the portable oracle lib.
 *
 * Attestation honesty
 * ────────────────────
 * The attestation is a SIGNED RECEIPT — the operator key (OG_PRIVATE_KEY) signs
 * a canonical digest of the inference receipt via EIP-191 personal-sign (same
 * mechanism 0gkit-attestation uses internally). Badge: "✓ signature verified" —
 * NOT TEE-quote verification. A real TEE-quote verifier can replace this Attestor
 * without changing the portable lib.
 *
 * Anchor
 * ───────
 * Default: 0G Storage (immutable content-addressed root hash).
 * Opt-in:  OG_ANCHOR_ONCHAIN=1 + OG_ANCHOR_ADDRESS → Anchor.sol on-chain tx.
 *
 * Environment variables (set in .env.local):
 *   OG_PRIVATE_KEY       — 0x-prefixed private key
 *   OG_RPC_URL           — 0G chain RPC URL
 *   OG_COMPUTE_MODEL     — model override (optional)
 *   OG_ANCHOR_ONCHAIN    — "1" to use on-chain anchor (default: 0G Storage)
 *   OG_ANCHOR_ADDRESS    — deployed Anchor contract address (OG_ANCHOR_ONCHAIN=1)
 */

// NOTE: Adapters MAY import 0gkit packages.
import { Compute } from "@foundryprotocol/0gkit-compute";
import { Storage } from "@foundryprotocol/0gkit-storage";
import { digestJson } from "@foundryprotocol/0gkit-core";
import { fromPrivateKey } from "@foundryprotocol/0gkit-wallet";
import { recoverSigner } from "@foundryprotocol/0gkit-attestation";
import { createTypedContract } from "@foundryprotocol/0gkit-contracts";
import { NextRequest, NextResponse } from "next/server";

import { resolveOracle, type Attestor, type Anchor } from "../../../lib/oracle.js";
import { ANCHOR_ABI } from "../../../lib/anchor-abi.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPrivateKey(): `0x${string}` {
  const key = process.env.OG_PRIVATE_KEY;
  if (!key) throw new Error("Missing OG_PRIVATE_KEY environment variable.");
  return key as `0x${string}`;
}

function getRpcUrl(): string {
  const rpc = process.env.OG_RPC_URL;
  if (!rpc) throw new Error("Missing OG_RPC_URL environment variable.");
  return rpc;
}

// ---------------------------------------------------------------------------
// Attestor: signed receipt
// Sign: signer.signMessage({raw: digestJson(receipt)})
// Verify: recompute digest, recover signer via recoverSigner from 0gkit-attestation
// Badge: "✓ signature verified" — NOT TEE-quote verification.
// ---------------------------------------------------------------------------

async function buildAttestor(privateKey: `0x${string}`): Promise<Attestor> {
  const signer = await fromPrivateKey(privateKey);

  return {
    async sign(receipt: unknown): Promise<{ digest: string; signature: string }> {
      const digest = digestJson(receipt);
      // EIP-191 personal-sign over the raw digest (matching 0gkit-attestation internals)
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
      // recoverSigner uses recoverAddress from viem/accounts internally
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
// Storage anchor: 0G Storage (default)
// "proof anchored to 0G Storage"
// ---------------------------------------------------------------------------

function buildStorageAnchor(storage: Storage): Anchor {
  return {
    async anchor(
      payload: Uint8Array | string
    ): Promise<{ ref: string; kind: "storage" | "onchain" }> {
      const encoded =
        typeof payload === "string" ? new TextEncoder().encode(payload) : payload;
      const result = await storage.upload(encoded);
      return { ref: result.root, kind: "storage" };
    },
  };
}

// ---------------------------------------------------------------------------
// On-chain anchor: Anchor.sol via createTypedContract (opt-in)
// "committed on-chain"
// ---------------------------------------------------------------------------

async function buildOnchainAnchor(
  privateKey: `0x${string}`,
  rpcUrl: string,
  contractAddress: string
): Promise<Anchor> {
  const signer = await fromPrivateKey(privateKey);
  const contract = createTypedContract({
    address: contractAddress as `0x${string}`,
    abi: ANCHOR_ABI,
    signer,
    rpcUrl,
  });

  return {
    async anchor(
      payload: Uint8Array | string
    ): Promise<{ ref: string; kind: "storage" | "onchain" }> {
      const text =
        typeof payload === "string" ? payload : new TextDecoder().decode(payload);
      // Use digestJson (keccak256 of canonical JSON) as the bytes32 hash
      const hash = digestJson({ payload: text });
      const tag = `ai-oracle:${Date.now()}`;
      // TypedContract.write is typed as Record<string, (...) => Promise<Receipt | DryRunResult<Receipt>>>
      type AnchorWrite = (
        args: [`0x${string}`, string]
      ) => Promise<{ txHash?: string }>;
      const anchorFn = (contract.write as Record<string, AnchorWrite>)[
        "anchor"
      ] as AnchorWrite;
      const writeResult = await anchorFn([hash, tag]);
      const txHash = writeResult.txHash ?? "unknown";
      return { ref: txHash, kind: "onchain" };
    },
  };
}

// ---------------------------------------------------------------------------
// POST /api/oracle
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { question, model } = body as { question?: unknown; model?: unknown };
    if (typeof question !== "string" || !question) {
      return NextResponse.json(
        { error: '"question" must be a non-empty string' },
        { status: 400 }
      );
    }

    const privateKey = getPrivateKey();
    const rpcUrl = getRpcUrl();

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

    // Build anchor (0G Storage by default; on-chain opt-in via OG_ANCHOR_ONCHAIN=1)
    let anchor: Anchor;
    if (process.env.OG_ANCHOR_ONCHAIN === "1") {
      const anchorAddress = process.env.OG_ANCHOR_ADDRESS;
      if (!anchorAddress) {
        return NextResponse.json(
          { error: "OG_ANCHOR_ADDRESS is required when OG_ANCHOR_ONCHAIN=1" },
          { status: 500 }
        );
      }
      anchor = await buildOnchainAnchor(privateKey, rpcUrl, anchorAddress);
    } else {
      const storage = new Storage({ privateKey, rpcUrl });
      anchor = buildStorageAnchor(storage);
    }

    // Resolve the oracle
    const result = await resolveOracle(
      {
        infer: inferClient,
        attestor,
        anchor,
        model: typeof model === "string" ? model : process.env.OG_COMPUTE_MODEL,
      },
      question
    );

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
