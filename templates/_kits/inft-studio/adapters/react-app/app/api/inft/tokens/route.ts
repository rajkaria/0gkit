/**
 * inft-studio — react-app adapter
 *
 * GET /api/inft/tokens?owner=<address>&limit=<n>
 *   — list token IDs currently owned by an address.
 *
 * Strategy: query Minted events for the address (as the initial recipient),
 * then call ownerOf() for each unique tokenId to confirm current ownership
 * (handles post-mint transfers). Results are sorted by tokenId ascending and
 * capped at `limit` (default 20).
 *
 * Response: { tokens: Array<{ tokenId: string; owner: string; tokenURI: string }> }
 *
 * Note: Inft.sol has no on-chain enumeration view (O(n) balanceOf loop is
 * acceptable for a template; production should index events or add enumeration).
 * This event-based approach is the honest, read-only alternative.
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
    const { searchParams } = request.nextUrl;
    const owner = searchParams.get("owner");
    const limitStr = searchParams.get("limit");

    if (!owner) {
      return NextResponse.json(
        { error: '"owner" query param is required' },
        { status: 400 }
      );
    }

    const limit = limitStr ? Math.min(parseInt(limitStr, 10) || 20, 100) : 20;

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

    // Query all Minted events where `to` == owner.
    // Inft.sol: event Minted(address indexed to, uint256 indexed tokenId, bytes32 metadataRoot, bytes32 provenanceHash)
    type MintedLog = { args: { to?: string; tokenId?: bigint } };
    const mintedLogs = (await (
      contract.events as Record<string, (opts?: unknown) => Promise<readonly unknown[]>>
    )["Minted"]!({
      fromBlock: "earliest",
      toBlock: "latest",
      args: { to: owner as `0x${string}` },
    })) as readonly MintedLog[];

    // Deduplicate tokenIds (sorted ascending).
    const uniqueTokenIds = Array.from(
      new Set(
        mintedLogs
          .map((l) => l.args.tokenId)
          .filter((id): id is bigint => id !== undefined)
      )
    ).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    // Confirm current ownership via ownerOf and fetch tokenURI.
    type ReadFn<T> = (args: [bigint]) => Promise<T>;
    const ownerOfFn = (contract.read as Record<string, ReadFn<string>>)[
      "ownerOf"
    ] as ReadFn<string>;
    const tokenURIFn = (contract.read as Record<string, ReadFn<string>>)[
      "tokenURI"
    ] as ReadFn<string>;

    const settled = await Promise.allSettled(
      uniqueTokenIds.map(async (tokenId) => {
        const [currentOwner, uri] = await Promise.all([
          ownerOfFn([tokenId]),
          tokenURIFn([tokenId]),
        ]);
        return { tokenId: tokenId.toString(), owner: currentOwner, tokenURI: uri };
      })
    );

    const tokens = settled
      .filter(
        (
          r
        ): r is PromiseFulfilledResult<{
          tokenId: string;
          owner: string;
          tokenURI: string;
        }> =>
          r.status === "fulfilled" &&
          r.value.owner.toLowerCase() === owner.toLowerCase()
      )
      .map((r) => r.value)
      .slice(0, limit);

    return NextResponse.json({ tokens });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
