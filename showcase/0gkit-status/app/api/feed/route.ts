import { NextResponse } from "next/server";
import {
  createFeed,
  type FeedStorage,
  type FeedCursor,
  type FeedPost,
} from "@/lib/feed";

// --- live-feed kit, composed into this app ---------------------------------
// Posts flow through the kit's portable `createFeed()`. Reorg-safety is only
// active with a deployed FeedEvents contract (OG_FEED_CONTRACT_ADDRESS) + the
// Indexer; without it this runs in honest "storage-only" mode. Blob storage is
// 0G Storage when OG_PRIVATE_KEY is set, else in-process.

export const dynamic = "force-dynamic";

let seq = 0;
const memBlobs = new Map<string, Uint8Array>();
const posts: FeedPost[] = [];

const inMemoryStorage: FeedStorage = {
  async upload(data) {
    const root = `mem-${(++seq).toString(16)}`;
    memBlobs.set(root, data);
    return { root };
  },
  async download(root) {
    return memBlobs.get(root);
  },
};

const cursor: FeedCursor = {
  async append(post) {
    posts.push(post);
  },
  subscribe() {
    return () => {};
  },
  async list() {
    return [...posts];
  },
};

async function getStorage(): Promise<{ storage: FeedStorage; onChain: boolean }> {
  const privateKey = process.env.OG_PRIVATE_KEY;
  if (!privateKey) return { storage: inMemoryStorage, onChain: false };
  const { Storage } = await import("@foundryprotocol/0gkit-storage");
  const og = new Storage({
    privateKey: privateKey as `0x${string}`,
    rpcUrl: process.env.OG_RPC_URL || "https://evmrpc-testnet.0g.ai",
  });
  return {
    storage: {
      upload: (data) => og.upload(data),
      download: (root) => og.download(root),
    },
    onChain: true,
  };
}

const serialize = (p: FeedPost) => ({ ...p, blockNumber: p.blockNumber.toString() });

export async function GET() {
  const reorgSafe = Boolean(process.env.OG_FEED_CONTRACT_ADDRESS);
  return NextResponse.json({
    ok: true,
    reorgSafe,
    posts: posts.map(serialize),
    mode: reorgSafe ? "indexer-backed" : "storage-only",
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { content?: string; author?: string };
    if (!body.content) {
      return NextResponse.json(
        { ok: false, error: "content is required" },
        { status: 400 }
      );
    }
    const { storage, onChain } = await getStorage();
    const feed = createFeed({ storage, cursor });
    const post = await feed.post({
      content: body.content.slice(0, 280),
      author: body.author?.slice(0, 64) || "anon",
    });
    return NextResponse.json({
      ok: true,
      onChainStorage: onChain,
      reorgSafe: Boolean(process.env.OG_FEED_CONTRACT_ADDRESS),
      post: serialize(post),
      posts: posts.map(serialize),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
