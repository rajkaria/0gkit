/**
 * inft-studio — chat adapter
 *
 * GET /api/inft/token?id=<tokenId>  — read token info via typed INFT_ABI client
 *
 * Environment variables (set in .env.local):
 *   OG_PRIVATE_KEY    — 0x-prefixed operator private key
 *   OG_RPC_URL        — 0G chain RPC URL
 *   OG_INFT_ADDRESS   — deployed Inft.sol contract address
 */

import { fromPrivateKey } from "@foundryprotocol/0gkit-wallet";
import { createTypedContract } from "@foundryprotocol/0gkit-contracts";
import { NextRequest, NextResponse } from "next/server";

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
