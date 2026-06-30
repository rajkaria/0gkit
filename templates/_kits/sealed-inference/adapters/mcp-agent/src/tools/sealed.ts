/**
 * sealed-inference — mcp-agent adapter
 *
 * Registers two MCP tools:
 *   sealed_infer    — run a sealed inference query
 *   sealed_verify   — verify a previously-signed inference receipt
 *
 * Attestation honesty
 * ────────────────────
 * The attestation is a SIGNED RECEIPT — the operator key signs a canonical
 * digest of the inference receipt via EIP-191 personal-sign. Badge means
 * "✓ signature verified" — NOT TEE-quote verification.
 *
 * Usage (in your MCP server entry point):
 *   import { registerSealedTools } from "./src/tools/sealed.js";
 *   registerSealedTools(server, {
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

import { sealedInfer, type Attestor } from "../../lib/sealed.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SealedToolOptions {
  /** 0G chain private key (0x-prefixed). */
  privateKey: string;
  /** 0G chain JSON-RPC URL. */
  rpc: string;
  /** Model override (optional). */
  model?: string;
  /** Expected signer address — what verify checks against. */
  attestorAddress: string;
}

/** Minimal MCP Server interface needed to register tools. */
export interface McpServerLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool(
    name: string,
    description: string,
    schema: object,
    handler: (args: any) => Promise<any>
  ): void;
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

export function registerSealedTools(
  server: McpServerLike,
  options: SealedToolOptions
): void {
  const { privateKey, rpc, model, attestorAddress } = options;

  // Lazily initialized shared deps
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
      _compute = new Compute({ signer });
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
  // sealed_infer
  // -------------------------------------------------------------------------

  server.tool(
    "sealed_infer",
    "Run a sealed inference query. " +
      "Returns the inference text, a signed attestation receipt " +
      "(✓ signature verified — operator key signed the inference receipt, " +
      "NOT TEE-quote verification), and a verified flag. " +
      "The badge reflects the real verify result — never hardcoded.",
    {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The prompt to send to the inference provider",
        },
        model: {
          type: "string",
          description: "Optional model override",
        },
      },
      required: ["prompt"],
    },
    async ({
      prompt,
      model: modelOverride,
    }: {
      prompt: string;
      model?: string;
    }) => {
      const compute = await getCompute();
      const inferClient = {
        async infer(args: { prompt: string; model?: string }) {
          const result = await compute.inference({
            messages: [{ role: "user" as const, content: args.prompt }],
            ...(args.model ? { model: args.model } : {}),
          });
          return { output: result.output };
        },
      };

      const result = await sealedInfer(
        {
          infer: inferClient,
          attestor: await getAttestor(),
          model: modelOverride ?? model,
        },
        prompt,
        attestorAddress
      );

      const badge = result.verified ? "✓ signature verified" : "⚠ unverified";

      return {
        content: [
          {
            type: "text",
            text: [
              `Prompt: ${prompt}`,
              `Text: ${result.text}`,
              `Attestation: ${badge} (digest: ${result.attestation.digest.slice(0, 18)}…)`,
              `Verified: ${result.verified}`,
            ].join("\n"),
          },
          {
            type: "text",
            text: JSON.stringify(
              {
                text: result.text,
                receipt: result.receipt,
                attestation: result.attestation,
                verified: result.verified,
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
  // sealed_verify
  // -------------------------------------------------------------------------

  server.tool(
    "sealed_verify",
    "Verify a signed sealed-inference receipt. Pass the `receipt` field returned by " +
      "sealed_infer — it is the exact object that was signed (including `ts`). " +
      "Recovers the signer from the signature and checks it matches the expected " +
      "operator address. Returns ok (boolean) and the recovered signer address. " +
      "Badge: '✓ signature verified' when ok=true — NOT TEE-quote verification.",
    {
      type: "object",
      properties: {
        receipt: {
          type: "object",
          description:
            "The receipt object returned by sealed_infer (prompt, text, ts). " +
            "Must be the exact object from the result — do not reconstruct it.",
          properties: {
            prompt: { type: "string" },
            text: { type: "string" },
            ts: { type: "number" },
          },
          required: ["prompt", "text", "ts"],
        },
        attestation: {
          type: "object",
          description:
            "The attestation object { digest, signature } from sealed_infer",
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
      const { ok, signer } = await (await getAttestor()).verify(
        receipt,
        attestation,
        expectedSigner
      );

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

  // Suppress unused variable warning for `rpc` (reserved for future use with Compute)
  void rpc;
}
