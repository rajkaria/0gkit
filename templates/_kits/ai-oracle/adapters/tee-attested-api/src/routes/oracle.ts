/**
 * ai-oracle — tee-attested-api adapter
 *
 * Hono router mounted under /oracle.
 *
 * POST /oracle/resolve  — resolve a question through the AI oracle
 *   Body: { "question": "...", "model"?: "..." }
 *
 * Response:
 *   { answer, answerHash, attestation: { digest, signature }, commitment: { ref, kind } }
 *
 * Attestation honesty
 * ────────────────────
 * The attestation is a SIGNED RECEIPT — the operator key signs a canonical
 * digest of the inference receipt via EIP-191 personal-sign. Badge means
 * "✓ signature verified" — NOT TEE-quote verification. The injected Attestor
 * seam allows a real TEE-quote verifier to slot in later.
 *
 * Anchor
 * ───────
 * Default: 0G Storage (immutable content-addressed root hash).
 * Opt-in:  OG_ANCHOR_ONCHAIN=1 + OG_ANCHOR_ADDRESS → Anchor.sol on-chain tx.
 *
 * Environment variables:
 *   OG_PRIVATE_KEY       — 0x-prefixed private key
 *   OG_RPC_URL           — 0G chain RPC URL
 *   OG_COMPUTE_MODEL     — model override (optional)
 *   OG_ANCHOR_ONCHAIN    — "1" to use on-chain anchor (default: 0G Storage)
 *   OG_ANCHOR_ADDRESS    — deployed Anchor contract address (OG_ANCHOR_ONCHAIN=1)
 */

// NOTE: Adapters MAY import 0gkit packages.
import { Hono } from "hono";
import { Compute } from "@foundryprotocol/0gkit-compute";
import { Storage } from "@foundryprotocol/0gkit-storage";
import { digestJson } from "@foundryprotocol/0gkit-core";
import { fromPrivateKey } from "@foundryprotocol/0gkit-wallet";
import { recoverSigner } from "@foundryprotocol/0gkit-attestation";
import { createTypedContract } from "@foundryprotocol/0gkit-contracts";

import { resolveOracle, type Attestor, type Anchor } from "../../lib/oracle.js";
import { ANCHOR_ABI } from "../../lib/anchor-abi.js";

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
// Storage anchor (default): "proof anchored to 0G Storage"
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
// On-chain anchor (opt-in): "committed on-chain" via Anchor.sol
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
// Router (exported; mount in app.ts under /oracle)
// ---------------------------------------------------------------------------

export function buildOracleRouter(): Hono {
  const router = new Hono();

  router.post("/resolve", async (c) => {
    let body: { question?: string; model?: string };
    try {
      body = (await c.req.json()) as { question?: string; model?: string };
    } catch {
      return c.json({ error: "invalid json" }, 400);
    }

    const { question, model } = body;
    if (!question || typeof question !== "string") {
      return c.json({ error: "missing or invalid question" }, 400);
    }

    const privateKey = getPrivateKey();
    const rpcUrl = getRpcUrl();

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

    const attestor = await buildAttestor(privateKey);

    let anchor: Anchor;
    if (process.env.OG_ANCHOR_ONCHAIN === "1") {
      const anchorAddress = process.env.OG_ANCHOR_ADDRESS;
      if (!anchorAddress) {
        return c.json(
          { error: "OG_ANCHOR_ADDRESS required when OG_ANCHOR_ONCHAIN=1" },
          500
        );
      }
      anchor = await buildOnchainAnchor(privateKey, rpcUrl, anchorAddress);
    } else {
      const storage = new Storage({ privateKey, rpcUrl });
      anchor = buildStorageAnchor(storage);
    }

    try {
      const result = await resolveOracle(
        {
          infer: inferClient,
          attestor,
          anchor,
          model: model ?? process.env.OG_COMPUTE_MODEL,
        },
        question
      );
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  return router;
}
