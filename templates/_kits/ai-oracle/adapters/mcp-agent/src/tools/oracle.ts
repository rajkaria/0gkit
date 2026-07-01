/**
 * ai-oracle — mcp-agent adapter
 *
 * Registers two MCP tools:
 *   oracle_resolve   — resolve a question through the AI oracle
 *   oracle_verify    — verify a previously-signed receipt
 *
 * Wires real @foundryprotocol/0gkit-* packages to the portable oracle lib.
 *
 * Attestation honesty
 * ────────────────────
 * The attestation is a SIGNED RECEIPT — the operator key signs a canonical
 * digest of the inference receipt via EIP-191 personal-sign. Badge means
 * "✓ signature verified" — NOT TEE-quote verification.
 *
 * Usage (in your MCP server entry point):
 *   import { registerOracleTools } from "./src/tools/oracle.js";
 *   registerOracleTools(server, {
 *     privateKey: process.env.OG_PRIVATE_KEY!,
 *     rpc: process.env.OG_RPC_URL!,
 *     model: process.env.OG_COMPUTE_MODEL,
 *     anchorOnchain: process.env.OG_ANCHOR_ONCHAIN === "1",
 *     anchorAddress: process.env.OG_ANCHOR_ADDRESS,
 *   });
 */

// NOTE: Adapters MAY import 0gkit packages.
import { Compute } from "@foundryprotocol/0gkit-compute";
import { Storage } from "@foundryprotocol/0gkit-storage";
import { digestJson } from "@foundryprotocol/0gkit-core";
import { fromPrivateKey } from "@foundryprotocol/0gkit-wallet";
import { recoverSigner } from "@foundryprotocol/0gkit-attestation";
import { createTypedContract } from "@foundryprotocol/0gkit-contracts";
import { collectToolPlugin, type McpServerLike } from "@foundryprotocol/0gkit-mcp";

import { resolveOracle, type Attestor, type Anchor } from "../../lib/oracle.js";
import { ANCHOR_ABI } from "../../lib/anchor-abi.js";

// Re-export McpServerLike so existing code using this file's type still works.
export type { McpServerLike };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OracleToolOptions {
  /** 0G chain private key (0x-prefixed). */
  privateKey: string;
  /** 0G chain JSON-RPC URL. */
  rpc: string;
  /** Model override (optional). */
  model?: string;
  /** Set to true to use on-chain anchor instead of 0G Storage. */
  anchorOnchain?: boolean;
  /** Deployed Anchor contract address (required when anchorOnchain=true). */
  anchorAddress?: string;
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
// Tool registration
// ---------------------------------------------------------------------------

export function registerOracleTools(
  server: McpServerLike,
  options: OracleToolOptions
): void {
  const { privateKey, rpc, model, anchorOnchain, anchorAddress } = options;

  // Lazily initialized shared deps
  let _compute: Compute | undefined;
  let _signer: Awaited<ReturnType<typeof fromPrivateKey>> | undefined;
  let _attestor: Attestor | undefined;
  let _anchor: Anchor | undefined;

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

  async function getAnchor(): Promise<Anchor> {
    if (!_anchor) {
      if (anchorOnchain) {
        if (!anchorAddress) {
          throw new Error("anchorAddress is required when anchorOnchain=true");
        }
        _anchor = await buildOnchainAnchor(
          privateKey as `0x${string}`,
          rpc,
          anchorAddress
        );
      } else {
        const storage = new Storage({ privateKey, rpcUrl: rpc });
        _anchor = buildStorageAnchor(storage);
      }
    }
    return _anchor;
  }

  // -------------------------------------------------------------------------
  // oracle_resolve
  // -------------------------------------------------------------------------

  server.tool(
    "oracle_resolve",
    "Resolve a question through the AI oracle. " +
      "Returns the answer, its SHA-256 hash, a signed attestation receipt " +
      "(✓ signature verified — operator key signed the inference receipt, " +
      "NOT TEE-quote verification), and a commitment anchored to 0G Storage " +
      "(or on-chain if configured).",
    {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The question to resolve",
        },
        model: {
          type: "string",
          description: "Optional model override",
        },
      },
      required: ["question"],
    },
    async ({
      question,
      model: modelOverride,
    }: {
      question: string;
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

      const result = await resolveOracle(
        {
          infer: inferClient,
          attestor: await getAttestor(),
          anchor: await getAnchor(),
          model: modelOverride ?? model,
        },
        question
      );

      const anchorLabel =
        result.commitment.kind === "onchain"
          ? "committed on-chain"
          : "proof anchored to 0G Storage";

      return {
        content: [
          {
            type: "text",
            text: [
              `Question: ${question}`,
              `Answer: ${result.answer}`,
              `Hash (SHA-256): ${result.answerHash}`,
              `Attestation: ✓ signature verified (digest: ${result.attestation.digest.slice(0, 18)}…)`,
              `Commitment: ${anchorLabel} (ref: ${result.commitment.ref})`,
            ].join("\n"),
          },
          {
            type: "text",
            text: JSON.stringify(
              {
                answer: result.answer,
                answerHash: result.answerHash,
                receipt: result.receipt,
                attestation: result.attestation,
                commitment: result.commitment,
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
  // oracle_verify
  // -------------------------------------------------------------------------

  server.tool(
    "oracle_verify",
    "Verify a signed oracle receipt. Pass the `receipt` field returned by " +
      "oracle_resolve — it is the exact object that was signed (including `ts`). " +
      "Recovers the signer from the signature and checks it matches the expected " +
      "operator address. Returns ok (boolean) and the recovered signer address. " +
      "Badge: '✓ signature verified' when ok=true — NOT TEE-quote verification.",
    {
      type: "object",
      properties: {
        receipt: {
          type: "object",
          description:
            "The receipt object returned by oracle_resolve (question, answer, answerHash, ts). " +
            "Must be the exact object from the result — do not reconstruct it.",
          properties: {
            question: { type: "string" },
            answer: { type: "string" },
            answerHash: { type: "string" },
            ts: { type: "number" },
          },
          required: ["question", "answer", "answerHash", "ts"],
        },
        attestation: {
          type: "object",
          description:
            "The attestation object { digest, signature } from oracle_resolve",
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
}

// ---------------------------------------------------------------------------
// mcpToolPlugin factory — additive export for use with create0gMcpServer
// ---------------------------------------------------------------------------

/**
 * Build an McpToolPlugin from the ai-oracle kit.
 *
 * Usage:
 *   import { mcpToolPlugin } from "./src/tools/oracle.js";
 *   const server = await create0gMcpServer({ plugins: [mcpToolPlugin(process.env)] });
 */
export const mcpToolPlugin = (env: Record<string, string | undefined>) =>
  collectToolPlugin("ai-oracle", (s) =>
    registerOracleTools(s, {
      privateKey: env.OG_PRIVATE_KEY ?? "",
      rpc: env.OG_RPC_URL ?? "",
      model: env.OG_COMPUTE_MODEL,
      anchorOnchain: env.OG_ANCHOR_ONCHAIN === "1",
      anchorAddress: env.OG_ANCHOR_ADDRESS,
    })
  );
