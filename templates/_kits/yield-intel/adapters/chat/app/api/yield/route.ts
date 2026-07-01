/**
 * yield-intel — chat adapter
 *
 * Next.js App Router route handler for yield analysis and decision logging.
 * Identical contract to the react-app adapter; duplicated for the chat base.
 *
 * POST /api/yield (body.action = "analyze" | "log")
 *
 * HONESTY NOTES
 * ─────────────
 * - INTENTIONALLY read-only — no execute/trade/swap/send/transfer endpoint.
 * - Testnet-default: OG_NETWORK defaults to "galileo".
 * - Attestation = SIGNED RECEIPT (✓ signature verified — NOT TEE-quote).
 * - Mainnet + automated execution are intentionally OUT OF SCOPE.
 *
 * Environment variables (.env.local):
 *   OG_PRIVATE_KEY     — 0x-prefixed operator private key
 *   OG_RPC_URL         — 0G chain RPC (default: https://evmrpc-testnet.0g.ai)
 *   OG_NETWORK         — "galileo" (testnet default)
 *   OG_COMPUTE_MODEL   — model override (optional)
 */

// NOTE: Adapters MAY import 0gkit packages.
import { Compute } from "@foundryprotocol/0gkit-compute";
import { Storage } from "@foundryprotocol/0gkit-storage";
import { digestJson } from "@foundryprotocol/0gkit-core";
import { fromPrivateKey } from "@foundryprotocol/0gkit-wallet";
import { recoverSigner } from "@foundryprotocol/0gkit-attestation";
import { NextRequest, NextResponse } from "next/server";

import { analyze, type Position } from "../../../lib/yield.js";
import {
  logDecision,
  type DecisionInput,
  type Attestor,
} from "../../../lib/decisionLog.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPrivateKey(): `0x${string}` {
  const key = process.env.OG_PRIVATE_KEY;
  if (!key) throw new Error("Missing OG_PRIVATE_KEY environment variable.");
  return key as `0x${string}`;
}

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
// POST /api/yield
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

    if (action === "analyze") {
      const { positions, model } = body as {
        positions?: unknown;
        model?: unknown;
      };
      if (!Array.isArray(positions) || positions.length === 0) {
        return NextResponse.json(
          { error: '"positions" must be a non-empty array' },
          { status: 400 }
        );
      }

      const privateKey = getPrivateKey();
      const signer = await fromPrivateKey(privateKey);
      const compute = new Compute({ signer, ...(process.env.ROUTER_API_KEY ? { routerApiKey: process.env.ROUTER_API_KEY } : {}) });

      const computeClient = {
        async infer(args: { prompt: string; model?: string }) {
          const result = await compute.router({
            messages: [{ role: "user" as const, content: args.prompt }],
            ...(args.model ? { model: args.model } : {}),
          });
          return { output: result.output };
        },
      };

      const items = await analyze(positions as Position[], {
        compute: computeClient,
        model: typeof model === "string" ? model : process.env.OG_COMPUTE_MODEL,
      });

      return NextResponse.json({ items });
    }

    if (action === "log") {
      const { decision } = body as { decision?: unknown };
      if (!decision || typeof decision !== "object") {
        return NextResponse.json(
          { error: '"decision" must be an object' },
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

      const record = await logDecision(decision as DecisionInput, {
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
