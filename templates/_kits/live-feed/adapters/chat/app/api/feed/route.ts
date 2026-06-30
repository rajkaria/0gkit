/**
 * live-feed — chat adapter
 *
 * Next.js App Router route handler for the live-feed kit (chat base template).
 * Structurally identical to the react-app adapter — both targets are Next.js
 * App Router apps with the same route convention.
 *
 * POST /api/feed   — publish a post
 *   Body: { "content": "...", "author": "..." }
 *   Response: { post: FeedPost }
 *
 * GET  /api/feed               — list current canonical posts (JSON)
 * GET  /api/feed               with Accept: text/event-stream — SSE live feed
 *
 * HONEST REORG-SAFETY FRAMING:
 *   - Storage upload: REAL — posts are uploaded to 0G Storage.
 *   - In-process cursor: REAL — SSE broadcasts live and orphan events.
 *   - Indexer reorg-safety: REAL WIRING, REQUIRES OG_FEED_CONTRACT_ADDRESS.
 *     Without it, runs in storage-only mode (reorg-drop NOT active, labeled clearly).
 *
 * Environment variables (set in .env.local):
 *   OG_PRIVATE_KEY              — 0x-prefixed private key (required)
 *   OG_RPC_URL                  — 0G chain RPC URL (required)
 *   OG_FEED_CONTRACT_ADDRESS    — deployed FeedEvents contract (optional)
 *   OG_FEED_NAMESPACE           — storage namespace (default: "live-feed")
 */

// NOTE: Adapters MAY import 0gkit packages.
import { Storage, type StorageConfig } from "@foundryprotocol/0gkit-storage";
import {
  Indexer,
  MemoryCursorStore,
  type DecodedEvent,
} from "@foundryprotocol/0gkit-indexer";
import { NextRequest, NextResponse } from "next/server";

import {
  createFeed,
  type FeedStorage,
  type FeedCursor,
  type FeedPost,
} from "../../../lib/feed.js";

// ---------------------------------------------------------------------------
// Minimal FeedEvents ABI
// ---------------------------------------------------------------------------

const FEED_EVENTS_ABI = [
  {
    name: "PostPublished",
    type: "event",
    inputs: [
      { name: "root", type: "bytes32", indexed: true },
      { name: "author", type: "address", indexed: true },
      { name: "content", type: "string", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// Singleton Storage
// ---------------------------------------------------------------------------

let _storage: Storage | undefined;

function getStorage(): Storage {
  if (_storage) return _storage;
  const privateKey = process.env.OG_PRIVATE_KEY;
  const rpcUrl = process.env.OG_RPC_URL;
  if (!privateKey || !rpcUrl) {
    throw new Error(
      "Missing OG_PRIVATE_KEY or OG_RPC_URL — required for live-feed Storage uploads."
    );
  }
  _storage = new Storage({ privateKey, rpcUrl } satisfies StorageConfig);
  return _storage;
}

// ---------------------------------------------------------------------------
// In-process FeedCursor with SSE broadcast
// ---------------------------------------------------------------------------

class InProcessFeedCursor implements FeedCursor {
  private readonly _posts: FeedPost[] = [];
  private readonly _listeners: Array<(posts: FeedPost[], isReorg: boolean) => void> =
    [];

  async append(post: FeedPost): Promise<void> {
    this._posts.push(post);
    for (const fn of this._listeners) fn([post], false);
  }

  subscribe(onBatch: (posts: FeedPost[], isReorg: boolean) => void): () => void {
    this._listeners.push(onBatch);
    return () => {
      const idx = this._listeners.indexOf(onBatch);
      if (idx !== -1) this._listeners.splice(idx, 1);
    };
  }

  async list(): Promise<FeedPost[]> {
    return [...this._posts];
  }

  rollbackToBlock(safeBlock: bigint): void {
    const orphaned = this._posts.filter((p) => p.blockNumber > safeBlock);
    this._posts.splice(
      0,
      this._posts.length,
      ...this._posts.filter((p) => p.blockNumber <= safeBlock)
    );
    if (orphaned.length > 0) {
      for (const fn of this._listeners) fn(orphaned, true);
    }
  }
}

const _cursor = new InProcessFeedCursor();

// ---------------------------------------------------------------------------
// FeedStorage adapter
// ---------------------------------------------------------------------------

function buildFeedStorageAdapter(): FeedStorage {
  const og = getStorage();
  return {
    async upload(data: Uint8Array) {
      return og.upload(data);
    },
    async download(root: string) {
      return og.download(root);
    },
  };
}

// ---------------------------------------------------------------------------
// Indexer setup
// ---------------------------------------------------------------------------

let _indexerStarted = false;

function maybeStartIndexer(): boolean {
  if (_indexerStarted) return true;
  const contractAddress = process.env.OG_FEED_CONTRACT_ADDRESS as
    | `0x${string}`
    | undefined;
  const rpcUrl = process.env.OG_RPC_URL;
  if (!contractAddress || !rpcUrl) return false;

  _indexerStarted = true;

  const indexer = new Indexer({
    network: "galileo",
    rpcUrl,
    cursor: new MemoryCursorStore(),
    pollIntervalMs: 2000,
    reorgDepth: 64,
  });

  void indexer
    .subscribe({
      contract: { address: contractAddress, abi: FEED_EVENTS_ABI },
      event: "PostPublished",
      fromBlock: "latest",

      onEvent: async (event: DecodedEvent) => {
        const args = event.args as { root?: string };
        if (!args.root) return;
        const rootStr = args.root.toLowerCase();
        const posts = await _cursor.list();
        const match = posts.find((p) => p.root.toLowerCase() === rootStr);
        if (match) match.blockNumber = event.blockNumber;
      },

      onReorg: async (rolledBack: DecodedEvent[]) => {
        if (rolledBack.length === 0) return;
        const minBlock = rolledBack.reduce(
          (min, e) => (e.blockNumber < min ? e.blockNumber : min),
          rolledBack[0]!.blockNumber
        );
        _cursor.rollbackToBlock(minBlock - 1n);
      },
    })
    .then(() => indexer.start())
    .catch((err: unknown) => {
      console.error("[live-feed/chat] Indexer failed to start:", err);
      _indexerStarted = false;
    });

  return true;
}

// ---------------------------------------------------------------------------
// Singleton Feed
// ---------------------------------------------------------------------------

let _feed: ReturnType<typeof createFeed> | undefined;

function getFeed(): ReturnType<typeof createFeed> {
  if (_feed) return _feed;
  _feed = createFeed({ storage: buildFeedStorageAdapter(), cursor: _cursor });
  maybeStartIndexer();
  return _feed;
}

// ---------------------------------------------------------------------------
// SSE broadcast
// ---------------------------------------------------------------------------

const _sseClients = new Set<(data: string) => void>();

_cursor.subscribe((posts: FeedPost[], isReorg: boolean) => {
  for (const post of posts) {
    const payload = `data: ${JSON.stringify({ type: isReorg ? "orphan" : "post", post })}\n\n`;
    for (const fn of _sseClients) {
      try {
        fn(payload);
      } catch {
        _sseClients.delete(fn);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// GET /api/feed
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse | Response> {
  const accept = request.headers.get("accept") ?? "";

  if (accept.includes("text/event-stream")) {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        const send = (data: string) => {
          try {
            controller.enqueue(enc.encode(data));
          } catch {
            _sseClients.delete(send);
          }
        };
        _sseClients.add(send);

        void _cursor.list().then((posts: FeedPost[]) => {
          for (const p of posts) {
            send(`data: ${JSON.stringify({ type: "post", post: p })}\n\n`);
          }
        });

        request.signal.addEventListener("abort", () => _sseClients.delete(send));
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  try {
    getFeed();
    const posts = await _cursor.list();
    return NextResponse.json({
      posts,
      reorgSafetyActive: _indexerStarted,
      notice: _indexerStarted
        ? undefined
        : "Storage-only mode: reorg-safety requires OG_FEED_CONTRACT_ADDRESS.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/feed
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { content, author } = body as { content?: unknown; author?: unknown };
    if (typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { error: '"content" must be a non-empty string' },
        { status: 400 }
      );
    }
    if (typeof author !== "string" || !author.trim()) {
      return NextResponse.json(
        { error: '"author" must be a non-empty string' },
        { status: 400 }
      );
    }

    const feed = getFeed();
    const post = await feed.post({ content, author });
    return NextResponse.json({ post });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
