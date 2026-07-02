/**
 * trade-signal — mcp-agent adapter
 *
 * Registers two MCP tools:
 *   trade_signal   — get an advisory buy/sell/hold signal + a signed receipt
 *   signal_verify  — verify a previously-signed signal receipt
 *
 * HONESTY
 * ───────
 * These tools are ADVISORY-only. `trade_signal` returns a recommendation with a
 * confidence and rationale plus a signed attestation — it does NOT place an
 * order, sign a value-moving transaction, or auto-trade. The agent/user decides
 * whether to act.
 *
 * Attestation is a SIGNED RECEIPT — the operator key signs a canonical digest of
 * the signal receipt via EIP-191 personal-sign. Badge means "✓ signature
 * verified" — NOT TEE-quote verification.
 *
 * Usage (in your MCP server entry point):
 *   import { registerSignalTools } from "./src/tools/signal.js";
 *   registerSignalTools(server, {
 *     privateKey: process.env.OG_PRIVATE_KEY!,
 *     rpc: process.env.OG_RPC_URL!,
 *     model: process.env.OG_COMPUTE_MODEL,
 *     attestorAddress: process.env.OG_ATTESTOR_ADDRESS!,
 *   });
 */

// NOTE: Adapters MAY import 0gkit packages.
import { Compute } from "@foundryprotocol/0gkit-compute";
import { digestJson } from "@foundryprotocol/0gkit-core";
import { fromPrivateKey } from "@foundryprotocol/0gkit-wallet";
import { recoverSigner } from "@foundryprotocol/0gkit-attestation";
import { collectToolPlugin, type McpServerLike } from "@foundryprotocol/0gkit-mcp";

import { analyzeSignal, type SignalInput } from "../../lib/signal.js";
import { attestSignal, type Attestor } from "../../lib/signalLog.js";

// Re-export McpServerLike so existing code using this file's type still works.
export type { McpServerLike };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SignalToolOptions {
  /** 0G chain private key (0x-prefixed). */
  privateKey: string;
  /** 0G chain JSON-RPC URL. */
  rpc: string;
  /** Model override (optional). */
  model?: string;
  /** Expected signer address — what signal_verify checks against. */
  attestorAddress: string;
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
// Tool registration
// ---------------------------------------------------------------------------

export function registerSignalTools(
  server: McpServerLike,
  options: SignalToolOptions
): void {
  const { privateKey, rpc, model, attestorAddress } = options;

  let _compute: Compute | undefined;
  let _signer: Awaited<ReturnType<typeof fromPrivateKey>> | undefined;
  let _attestor: Attestor | undefined;

  async function getSigner(): Promise<Awaited<ReturnType<typeof fromPrivateKey>>> {
    if (!_signer) {
      _signer = await fromPrivateKey(privateKey as `0x${string}`);
    }
    return _signer;
  }

  async function getCompute(): Promise<Compute> {
    if (!_compute) {
      const signer = await getSigner();
      _compute = new Compute({
        signer,
        ...(process.env.ROUTER_API_KEY
          ? { routerApiKey: process.env.ROUTER_API_KEY }
          : {}),
      });
    }
    return _compute;
  }

  async function getAttestor(): Promise<Attestor> {
    if (!_attestor) {
      _attestor = await buildAttestor(privateKey as `0x${string}`);
    }
    return _attestor;
  }

  // -------------------------------------------------------------------------
  // trade_signal
  // -------------------------------------------------------------------------

  server.tool(
    "trade_signal",
    "Get an ADVISORY buy/sell/hold signal for an asset from its recent price " +
      "history, plus a signed attestation receipt (✓ signature verified — operator " +
      "key signed the signal receipt, NOT TEE-quote verification). This tool does " +
      "NOT place orders or move funds — it only advises. The caller decides whether to act.",
    {
      type: "object",
      properties: {
        asset: { type: "string", description: "Asset ticker, e.g. ETH, BTC" },
        currentPrice: { type: "number", description: "Most recent price" },
        history: {
          type: "array",
          items: { type: "number" },
          description: "Recent price history, oldest → newest",
        },
        indicators: {
          type: "object",
          description: "Optional technical indicators, e.g. { rsi14: 58, sma20: 3120 }",
          additionalProperties: { type: "number" },
        },
        model: { type: "string", description: "Optional model override" },
      },
      required: ["asset", "currentPrice", "history"],
    },
    async ({
      asset,
      currentPrice,
      history,
      indicators,
      model: modelOverride,
    }: {
      asset: string;
      currentPrice: number;
      history: number[];
      indicators?: Record<string, number>;
      model?: string;
    }) => {
      const compute = await getCompute();
      const computeClient = {
        async infer(args: { prompt: string; model?: string }) {
          const result = await compute.router({
            messages: [{ role: "user" as const, content: args.prompt }],
            ...(args.model ? { model: args.model } : {}),
          });
          return { output: result.output };
        },
      };

      const input: SignalInput = {
        asset,
        currentPrice,
        history,
        ...(indicators ? { indicators } : {}),
      };

      const signal = await analyzeSignal(input, {
        compute: computeClient,
        model: modelOverride ?? model,
      });

      const sealed = await attestSignal(
        {
          asset,
          action: signal.action,
          confidence: signal.confidence,
          rationale: signal.rationale,
        },
        { attestor: await getAttestor() },
        attestorAddress
      );

      const badge = sealed.verified ? "✓ signature verified" : "⚠ unverified";

      return {
        content: [
          {
            type: "text",
            text: [
              `Asset: ${asset}`,
              `Advisory signal: ${signal.action.toUpperCase()} (confidence ${signal.confidence.toFixed(2)})`,
              `Rationale: ${signal.rationale}`,
              `Attestation: ${badge} (digest: ${sealed.attestation.digest.slice(0, 18)}…)`,
              `Advisory only — this tool does not place orders or move funds.`,
            ].join("\n"),
          },
          {
            type: "text",
            text: JSON.stringify(
              {
                signal,
                receipt: sealed.receipt,
                attestation: sealed.attestation,
                verified: sealed.verified,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // -------------------------------------------------------------------------
  // signal_verify
  // -------------------------------------------------------------------------

  server.tool(
    "signal_verify",
    "Verify a signed trade-signal receipt. Pass the `receipt` field returned by " +
      "trade_signal — it is the exact object that was signed (including `ts`). " +
      "Recovers the signer from the signature and checks it matches the expected " +
      "operator address. Returns ok (boolean) and the recovered signer address. " +
      "Badge: '✓ signature verified' when ok=true — NOT TEE-quote verification.",
    {
      type: "object",
      properties: {
        receipt: {
          type: "object",
          description:
            "The receipt object returned by trade_signal (asset, action, confidence, " +
            "rationale, ts). Must be the exact object from the result — do not reconstruct it.",
          properties: {
            asset: { type: "string" },
            action: { type: "string" },
            confidence: { type: "number" },
            rationale: { type: "string" },
            ts: { type: "number" },
          },
          required: ["asset", "action", "confidence", "rationale", "ts"],
        },
        attestation: {
          type: "object",
          description: "The attestation object { digest, signature } from trade_signal",
          properties: {
            digest: { type: "string" },
            signature: { type: "string" },
          },
          required: ["digest", "signature"],
        },
        expectedSigner: {
          type: "string",
          description: "Expected operator address (0x-prefixed)",
        },
      },
      required: ["receipt", "attestation", "expectedSigner"],
    },
    async ({
      receipt,
      attestation,
      expectedSigner,
    }: {
      receipt: unknown;
      attestation: { digest: string; signature: string };
      expectedSigner: string;
    }) => {
      const { ok, signer } = await (
        await getAttestor()
      ).verify(receipt, attestation, expectedSigner);

      return {
        content: [
          {
            type: "text",
            text: ok
              ? `✓ signature verified — signer: ${signer}`
              : `⚠ unverified — recovered signer: ${signer}, expected: ${expectedSigner}`,
          },
        ],
      };
    }
  );

  // Suppress unused variable warning for `rpc` (reserved for future Storage use).
  void rpc;
}

// ---------------------------------------------------------------------------
// mcpToolPlugin factory — additive export for use with create0gMcpServer
// ---------------------------------------------------------------------------

/**
 * Build an McpToolPlugin from the trade-signal kit.
 *
 * Usage:
 *   import { mcpToolPlugin } from "./src/tools/signal.js";
 *   const server = await create0gMcpServer({ plugins: [mcpToolPlugin(process.env)] });
 */
export const mcpToolPlugin = (env: Record<string, string | undefined>) =>
  collectToolPlugin("trade-signal", (s) =>
    registerSignalTools(s, {
      privateKey: env.OG_PRIVATE_KEY ?? "",
      rpc: env.OG_RPC_URL ?? "",
      model: env.OG_COMPUTE_MODEL,
      attestorAddress: env.OG_ATTESTOR_ADDRESS ?? "",
    })
  );
