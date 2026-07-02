/**
 * trade-signal — chat adapter
 *
 * Next.js App Router route handler for advisory signal analysis + attested logging.
 *
 * POST /api/signal  (dispatcher on body.action)
 *   { "action": "analyze", "input": SignalInput, "model"?: string }
 *       → { signal: Signal }
 *   { "action": "log", "signal": SignalLogInput }
 *       → { record: SignalRecord }
 *
 * HONESTY NOTES
 * ─────────────
 * - These routes are ADVISORY-only (analyze + log). There is NO
 *   execute/trade/swap/send/transfer endpoint — this app never places an order
 *   or moves value.
 * - Testnet-default: OG_RPC_URL defaults to the Galileo testnet endpoint.
 * - The attestation is a SIGNED RECEIPT — the operator key (OG_PRIVATE_KEY) signs
 *   a canonical digest of the signal receipt. Badge: "✓ signature verified" —
 *   NOT TEE-quote verification.
 * - Mainnet + automated execution are intentionally OUT OF SCOPE. See .env.example.
 *
 * Environment variables (.env.local):
 *   OG_PRIVATE_KEY     — 0x-prefixed operator private key
 *   OG_RPC_URL         — 0G chain RPC (default: https://evmrpc-testnet.0g.ai)
 *   OG_COMPUTE_MODEL   — model override (optional)
 */

// NOTE: Adapters MAY import 0gkit packages.
import { Compute } from "@foundryprotocol/0gkit-compute";
import { Storage } from "@foundryprotocol/0gkit-storage";
import { digestJson } from "@foundryprotocol/0gkit-core";
import { fromPrivateKey } from "@foundryprotocol/0gkit-wallet";
import { recoverSigner } from "@foundryprotocol/0gkit-attestation";
import { NextRequest, NextResponse } from "next/server";

import { analyzeSignal, type SignalInput } from "../../../lib/signal.js";
import {
  logSignal,
  type SignalLogInput,
  type Attestor,
} from "../../../lib/signalLog.js";

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
// Sign: digestJson(receipt) → EIP-191 personal-sign → { digest, signature }
// Verify: recompute digest, recover signer via recoverSigner
// Badge: "✓ signature verified" — NOT TEE-quote verification.
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
// POST /api/signal (dispatcher: body.action = "analyze" | "log")
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { action } = body as { action?: unknown };

    // ── analyze ──────────────────────────────────────────────────────────────
    if (action === "analyze") {
      const { input, model } = body as { input?: unknown; model?: unknown };
      if (!input || typeof input !== "object") {
        return NextResponse.json(
          { error: '"input" must be a SignalInput object' },
          { status: 400 }
        );
      }

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

      const signal = await analyzeSignal(input as SignalInput, {
        compute: computeClient,
        model: typeof model === "string" ? model : process.env.OG_COMPUTE_MODEL,
      });

      return NextResponse.json({ signal });
    }

    // ── log ──────────────────────────────────────────────────────────────────
    if (action === "log") {
      const { signal } = body as { signal?: unknown };
      if (!signal || typeof signal !== "object") {
        return NextResponse.json(
          { error: '"signal" must be a SignalLogInput object' },
          { status: 400 }
        );
      }

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

      const record = await logSignal(signal as SignalLogInput, {
        attestor,
        storage: storageClient,
      });

      return NextResponse.json({ record });
    }

    return NextResponse.json(
      { error: '"action" must be "analyze" or "log"' },
      { status: 400 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
