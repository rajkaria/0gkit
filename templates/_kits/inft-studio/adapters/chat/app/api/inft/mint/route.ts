/**
 * inft-studio — chat adapter
 *
 * POST /api/inft/mint  — mint an intelligent NFT
 *   Body: {
 *     "to": "0x...",
 *     "metadata": { "name": "...", "description": "...", ... },
 *     "mediaBase64": "<base64-encoded media bytes>",
 *     "attestProvenance"?: true,
 *     "model"?: "...",
 *     "prompt"?: "..."
 *   }
 *
 * Identical in behaviour to the react-app adapter (both bases are Next.js App Router).
 *
 * tokenId — obtained honestly from the on-chain Minted event
 * ─────────────────────────────────────────────────────────────
 * createTypedContract().write.mint(...) returns a Receipt { txHash, blockNumber,
 * latencyMs } — NOT the Solidity return value. The tokenId is recovered by
 * querying contract.events.Minted({ fromBlock, toBlock }) on the same block and
 * reading args.tokenId from the matching log.
 *
 * Environment variables (set in .env.local):
 *   OG_PRIVATE_KEY    — 0x-prefixed operator private key
 *   OG_RPC_URL        — 0G chain RPC URL
 *   OG_INFT_ADDRESS   — deployed Inft.sol contract address
 *   OG_COMPUTE_MODEL  — optional default model name
 */

import { Storage } from "@foundryprotocol/0gkit-storage";
import { digestJson } from "@foundryprotocol/0gkit-core";
import { fromPrivateKey } from "@foundryprotocol/0gkit-wallet";
import { recoverSigner } from "@foundryprotocol/0gkit-attestation";
import { createTypedContract } from "@foundryprotocol/0gkit-contracts";
import { NextRequest, NextResponse } from "next/server";

import {
  mintInft,
  type StorageClient,
  type Erc721MintClient,
  type Attestor,
} from "../../../../lib/inft.js";
import { INFT_ABI } from "../../../../lib/inft-abi.js";

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

function getInftAddress(): `0x${string}` {
  const addr = process.env.OG_INFT_ADDRESS;
  if (!addr) throw new Error("Missing OG_INFT_ADDRESS environment variable.");
  return addr as `0x${string}`;
}

function buildStorageClient(privateKey: `0x${string}`, rpcUrl: string): StorageClient {
  const storage = new Storage({ privateKey, rpcUrl });
  return {
    async upload(bytes: Uint8Array) {
      const result = await storage.upload(bytes);
      return { root: result.root };
    },
  };
}

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

async function buildMintClient(
  privateKey: `0x${string}`,
  rpcUrl: string,
  contractAddress: `0x${string}`
): Promise<Erc721MintClient> {
  const signer = await fromPrivateKey(privateKey);
  const contract = createTypedContract({
    address: contractAddress,
    abi: INFT_ABI,
    signer,
    rpcUrl,
  });

  return {
    async mint(to: string, metadataRoot: string) {
      const receipt = (await (
        contract.write as Record<string, (...args: unknown[]) => Promise<unknown>>
      )["mint"]!([to as `0x${string}`, metadataRoot as `0x${string}`])) as {
        txHash?: string;
        blockNumber?: bigint;
        latencyMs: number;
      };

      const blockNumber = receipt.blockNumber;
      const mintedLogs = (await (
        contract.events as Record<string, (opts?: unknown) => Promise<readonly unknown[]>>
      )["Minted"]!({
        fromBlock: blockNumber,
        toBlock: blockNumber,
        args: { to: to as `0x${string}` },
      })) as readonly { args: { tokenId?: bigint; to?: string } }[];

      const log = mintedLogs[mintedLogs.length - 1];
      if (!log?.args?.tokenId) {
        throw new Error(
          `inft-studio: Minted event not found in block ${String(blockNumber)} for recipient ${to}. ` +
            `Cannot determine tokenId — not returning a fabricated value.`
        );
      }

      return {
        tokenId: log.args.tokenId,
        txHash: receipt.txHash,
      };
    },
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { to, metadata, mediaBase64, attestProvenance, model, prompt } = body as {
      to?: unknown;
      metadata?: unknown;
      mediaBase64?: unknown;
      attestProvenance?: unknown;
      model?: unknown;
      prompt?: unknown;
    };

    if (typeof to !== "string" || !to) {
      return NextResponse.json({ error: '"to" must be a non-empty string' }, { status: 400 });
    }
    if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
      return NextResponse.json({ error: '"metadata" must be an object' }, { status: 400 });
    }
    if (typeof mediaBase64 !== "string" || !mediaBase64) {
      return NextResponse.json(
        { error: '"mediaBase64" must be a non-empty string' },
        { status: 400 }
      );
    }

    const privateKey = getPrivateKey();
    const rpcUrl = getRpcUrl();
    const contractAddress = getInftAddress();
    const mediaBytes = Buffer.from(mediaBase64, "base64");
    const storage = buildStorageClient(privateKey, rpcUrl);
    const erc721 = await buildMintClient(privateKey, rpcUrl, contractAddress);
    const shouldAttest = attestProvenance === true;
    const attestor = shouldAttest ? await buildAttestor(privateKey) : undefined;

    const result = await mintInft(
      {
        to,
        metadata: metadata as Record<string, unknown>,
        media: new Uint8Array(mediaBytes),
        attestProvenance: shouldAttest,
        model: typeof model === "string" ? model : process.env.OG_COMPUTE_MODEL,
        prompt: typeof prompt === "string" ? prompt : undefined,
      },
      { storage, erc721, attestor }
    );

    return NextResponse.json({
      ...result,
      tokenId: result.tokenId.toString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
