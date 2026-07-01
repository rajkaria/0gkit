/**
 * sealed-inference — tee-attested-api adapter
 *
 * Hono router mounted under /sealed.
 *
 * POST /sealed/infer  — run a sealed inference query
 *   Body: { "prompt": "...", "model"?: "..." }
 *
 * Response:
 *   { text, receipt, attestation: { digest, signature }, verified: boolean }
 *
 * Attestation honesty
 * ────────────────────
 * The attestation is a SIGNED RECEIPT — the operator key signs a canonical
 * digest of the inference receipt via EIP-191 personal-sign. Badge means
 * "✓ signature verified" — NOT TEE-quote verification. The injected Attestor
 * seam allows a real TEE-quote verifier to slot in later.
 *
 * Environment variables:
 *   OG_PRIVATE_KEY         — 0x-prefixed private key
 *   OG_RPC_URL             — 0G chain RPC URL
 *   OG_COMPUTE_MODEL       — model override (optional)
 *   OG_ATTESTOR_ADDRESS    — expected signer address
 */

// NOTE: Adapters MAY import 0gkit packages.
import { Hono } from "hono";
import { Compute } from "@foundryprotocol/0gkit-compute";
import { digestJson } from "@foundryprotocol/0gkit-core";
import { fromPrivateKey } from "@foundryprotocol/0gkit-wallet";
import { recoverSigner } from "@foundryprotocol/0gkit-attestation";

import { sealedInfer, type Attestor } from "../../lib/sealed.js";

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
// ---------------------------------------------------------------------------

async function buildAttestor(privateKey: `0x${string}`): Promise<Attestor> {
  const signer = await fromPrivateKey(privateKey);

  return {
    async sign(receipt: unknown): Promise<{ digest: string; signature: string }> {
      const digest = digestJson(receipt);
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
// Router (exported; mount in app.ts under /sealed)
// ---------------------------------------------------------------------------

export function buildSealedRouter(): Hono {
  const router = new Hono();

  router.post("/infer", async (c) => {
    let body: { prompt?: string; model?: string };
    try {
      body = (await c.req.json()) as { prompt?: string; model?: string };
    } catch {
      return c.json({ error: "invalid json" }, 400);
    }

    const { prompt, model } = body;
    if (!prompt || typeof prompt !== "string") {
      return c.json({ error: "missing or invalid prompt" }, 400);
    }

    const privateKey = getPrivateKey();
    const attestorAddress = getAttestorAddress();

    const signer = await fromPrivateKey(privateKey);
    const compute = new Compute({ signer, ...(process.env.ROUTER_API_KEY ? { routerApiKey: process.env.ROUTER_API_KEY } : {}) });
    const inferClient = {
      async infer(args: { prompt: string; model?: string }) {
        const result = await compute.router({
          messages: [{ role: "user" as const, content: args.prompt }],
          ...(args.model ? { model: args.model } : {}),
        });
        return { output: result.output };
      },
    };

    const attestor = await buildAttestor(privateKey);

    try {
      const result = await sealedInfer(
        {
          infer: inferClient,
          attestor,
          model: model ?? process.env.OG_COMPUTE_MODEL,
        },
        prompt,
        attestorAddress
      );
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  return router;
}
