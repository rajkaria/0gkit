/**
 * trade-signal — tee-attested-api adapter
 *
 * Hono router mounted under /signal.
 *
 * POST /signal/analyze
 *   Body: { "input": SignalInput, "model"?: string }
 *   Response: { signal: Signal }
 *
 * POST /signal/log
 *   Body: { "signal": SignalLogInput }
 *   Response: { record: SignalRecord }
 *
 * HONESTY NOTES
 * ─────────────
 * - ADVISORY-only — no execute/trade/swap/send/transfer endpoint. This service
 *   never places an order or moves value.
 * - Testnet-default: OG_RPC_URL defaults to the Galileo testnet endpoint.
 * - Attestation = SIGNED RECEIPT (✓ signature verified — NOT TEE-quote).
 * - Mainnet + automated execution are intentionally OUT OF SCOPE. See .env.example.
 *
 * Environment variables:
 *   OG_PRIVATE_KEY     — 0x-prefixed operator private key
 *   OG_RPC_URL         — 0G chain RPC (default: https://evmrpc-testnet.0g.ai)
 *   OG_COMPUTE_MODEL   — model override (optional)
 */

// NOTE: Adapters MAY import 0gkit packages.
import { Hono } from "hono";
import { Compute } from "@foundryprotocol/0gkit-compute";
import { Storage } from "@foundryprotocol/0gkit-storage";
import { digestJson } from "@foundryprotocol/0gkit-core";
import { fromPrivateKey } from "@foundryprotocol/0gkit-wallet";
import { recoverSigner } from "@foundryprotocol/0gkit-attestation";

import { analyzeSignal, type SignalInput } from "../../lib/signal.js";
import { logSignal, type SignalLogInput, type Attestor } from "../../lib/signalLog.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPrivateKey(): `0x${string}` {
  const key = process.env.OG_PRIVATE_KEY;
  if (!key) throw new Error("Missing OG_PRIVATE_KEY environment variable.");
  return key as `0x${string}`;
}

// Testnet default: Galileo — mainnet is intentionally out of scope.
function getRpcUrl(): string {
  return process.env.OG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
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
// Router (exported; mount in app.ts under /signal)
// ---------------------------------------------------------------------------

export function buildSignalRouter(): Hono {
  const router = new Hono();

  // POST /signal/analyze — advisory signal analysis (no execution)
  router.post("/analyze", async (c) => {
    let body: { input?: SignalInput; model?: string };
    try {
      body = (await c.req.json()) as { input?: SignalInput; model?: string };
    } catch {
      return c.json({ error: "invalid json" }, 400);
    }

    const { input, model } = body;
    if (!input || typeof input !== "object") {
      return c.json({ error: "missing or invalid input object" }, 400);
    }

    try {
      const privateKey = getPrivateKey();
      const signer = await fromPrivateKey(privateKey);
      const compute = new Compute({
        signer,
        ...(process.env.ROUTER_API_KEY
          ? { routerApiKey: process.env.ROUTER_API_KEY }
          : {}),
      });

      const computeClient = {
        async infer(args: { prompt: string; model?: string }) {
          const result = await compute.router({
            messages: [{ role: "user" as const, content: args.prompt }],
            ...(args.model ? { model: args.model } : {}),
          });
          return { output: result.output };
        },
      };

      const signal = await analyzeSignal(input, {
        compute: computeClient,
        model: model ?? process.env.OG_COMPUTE_MODEL,
      });

      return c.json({ signal });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  // POST /signal/log — record a signal with attestation (no execution)
  router.post("/log", async (c) => {
    let body: { signal?: SignalLogInput };
    try {
      body = (await c.req.json()) as { signal?: SignalLogInput };
    } catch {
      return c.json({ error: "invalid json" }, 400);
    }

    const { signal } = body;
    if (!signal || typeof signal !== "object") {
      return c.json({ error: "missing or invalid signal object" }, 400);
    }

    try {
      const privateKey = getPrivateKey();
      const rpcUrl = getRpcUrl();

      const attestor = await buildAttestor(privateKey);
      const storage = new Storage({ privateKey, rpcUrl });

      const storageClient = {
        async upload(bytes: Uint8Array) {
          const result = await storage.upload(bytes);
          return { root: result.root };
        },
      };

      const record = await logSignal(signal, { attestor, storage: storageClient });
      return c.json({ record });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  return router;
}
