/**
 * inft-studio — react-app adapter
 *
 * Next.js App Router route handler for the iNFT studio.
 *
 * POST /api/inft/mint   — mint an intelligent NFT
 *   Body: {
 *     "to": "0x...",
 *     "metadata": { "name": "...", "description": "...", ... },
 *     "mediaBase64": "<base64-encoded media bytes>",
 *     "attestProvenance"?: true,
 *     "model"?: "...",
 *     "prompt"?: "..."
 *   }
 *
 * GET /api/inft/token?id=<tokenId>  — read token info via typed ERC-721 client
 *
 * Wires real @foundryprotocol/0gkit-* packages to the portable inft lib.
 *
 * Attestation honesty
 * ────────────────────
 * The attestation is a SIGNED RECEIPT — the operator key (OG_PRIVATE_KEY) signs
 * a canonical digest of the provenance receipt via EIP-191 personal-sign (same
 * mechanism 0gkit-attestation uses internally). Badge: "✓ signature verified" —
 * NOT TEE-quote verification. A real TEE-quote verifier can replace this Attestor
 * without changing the portable lib.
 *
 * ERC-721 Mint note
 * ─────────────────
 * Erc721Abi is the STANDARD ERC-721 ABI (no mint). Mint goes through INFT_ABI
 * (lib/inft-abi.ts) via createTypedContract. Read operations (tokenURI, ownerOf)
 * use the same INFT_ABI read client.
 *
 * Environment variables (set in .env.local):
 *   OG_PRIVATE_KEY    — 0x-prefixed operator private key
 *   OG_RPC_URL        — 0G chain RPC URL
 *   OG_INFT_ADDRESS   — deployed Inft.sol contract address
 *   OG_COMPUTE_MODEL  — optional default model name
 */

// NOTE: Adapters MAY import 0gkit packages.
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
} from "../../../lib/inft.js";
import { INFT_ABI } from "../../../lib/inft-abi.js";

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

function getInftAddress(): `0x${string}` {
  const addr = process.env.OG_INFT_ADDRESS;
  if (!addr) throw new Error("Missing OG_INFT_ADDRESS environment variable.");
  return addr as `0x${string}`;
}

// ---------------------------------------------------------------------------
// Storage client
// ---------------------------------------------------------------------------

function buildStorageClient(privateKey: `0x${string}`, rpcUrl: string): StorageClient {
  const storage = new Storage({ privateKey, rpcUrl });
  return {
    async upload(bytes: Uint8Array) {
      const result = await storage.upload(bytes);
      return { root: result.root };
    },
  };
}

// ---------------------------------------------------------------------------
// Attestor: signed receipt (operator key via EIP-191 personal-sign)
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
// ERC-721 mint client: Inft.sol via createTypedContract(INFT_ABI)
// NOTE: standard Erc721Abi has no mint — we use INFT_ABI from lib/inft-abi.ts
// ---------------------------------------------------------------------------

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
      type MintFn = (
        args: [`0x${string}`, `0x${string}`]
      ) => Promise<{ tokenId?: bigint; txHash?: string }>;
      const mintFn = (contract.write as Record<string, MintFn>)["mint"] as MintFn;
      const result = await mintFn([to as `0x${string}`, metadataRoot as `0x${string}`]);
      return {
        tokenId: result.tokenId ?? 0n,
        txHash: result.txHash,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// POST /api/inft/mint
// ---------------------------------------------------------------------------

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
      return NextResponse.json(
        { error: '"to" must be a non-empty string' },
        { status: 400 }
      );
    }
    if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
      return NextResponse.json(
        { error: '"metadata" must be an object' },
        { status: 400 }
      );
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

    // Decode media bytes from base64
    const mediaBytes = Buffer.from(mediaBase64, "base64");

    // Build injected deps
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

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// GET /api/inft/token?id=<tokenId>
// Read token info via INFT_ABI read client
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const tokenIdStr = request.nextUrl.searchParams.get("id");
    if (!tokenIdStr) {
      return NextResponse.json(
        { error: '"id" query param is required' },
        { status: 400 }
      );
    }

    const tokenId = BigInt(tokenIdStr);
    const privateKey = getPrivateKey();
    const rpcUrl = getRpcUrl();
    const contractAddress = getInftAddress();

    const signer = await fromPrivateKey(privateKey);
    const contract = createTypedContract({
      address: contractAddress,
      abi: INFT_ABI,
      signer,
      rpcUrl,
    });

    type ReadFn<T> = (args: [bigint]) => Promise<T>;
    const ownerOf = (contract.read as Record<string, ReadFn<string>>)[
      "ownerOf"
    ] as ReadFn<string>;
    const tokenURI = (contract.read as Record<string, ReadFn<string>>)[
      "tokenURI"
    ] as ReadFn<string>;

    const [owner, uri] = await Promise.all([ownerOf([tokenId]), tokenURI([tokenId])]);

    return NextResponse.json({ tokenId: tokenIdStr, owner, tokenURI: uri });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
