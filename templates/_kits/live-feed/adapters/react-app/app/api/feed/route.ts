/**
 * live-feed — react-app adapter
 *
 * Next.js App Router route handler for the live-feed kit.
 *
 * POST /api/feed   — publish a post (content + author)
 *   Body: { "content": "...", "author": "..." }
 *   Response: { post: FeedPost }
 *
 * GET  /api/feed   — list all current canonical posts (JSON)
 * GET  /api/feed   with Accept: text/event-stream — SSE live feed
 *
 * ──────────────────────────────────────────────────────────────────────────
 * HONEST REORG-SAFETY FRAMING
 * ──────────────────────────────────────────────────────────────────────────
 * The portable lib's reorg-drop guarantee is proven in lib/__tests__/feed.test.ts.
 * This adapter wires the real @foundryprotocol/0gkit-indexer Indexer. The
 * Indexer's reorg-safety (BlockTracker / MemoryCursorStore) is REAL — but it
 * requires on-chain CONTRACT events to function: subscribe({ contract: {
 * address, abi }, event }) watches for emitted events and rolls back on a reorg.
 *
 * To deliver REAL reorg-safety end-to-end:
 *   - Posts must emit an on-chain PostPublished event carrying the 0G Storage root.
 *   - The Indexer indexes those events; its onEvent fills the cursor.
 *   - The Indexer's onReorg fires when blocks are rolled back; the adapter
 *     drops orphaned posts from the cursor and broadcasts them as SSE "orphan" events.
 *
 * This adapter provides an HONEST wiring skeleton for that path:
 *   (a) Storage upload: REAL — posts are uploaded to 0G Storage.
 *   (b) In-process cursor: REAL — posts are queued and broadcast via SSE.
 *   (c) Indexer subscription: REAL WIRING, REQUIRES DEPLOYED CONTRACT.
 *       Set OG_FEED_CONTRACT_ADDRESS to a deployed FeedEvents contract address
 *       to enable. Without it, the adapter runs in storage-only mode where the
 *       Indexer is not started and reorg-safety is NOT provided.
 *       Storage-only mode is clearly labeled in the API response.
 *
 * Environment variables (set in .env.local):
 *   OG_PRIVATE_KEY              — 0x-prefixed private key (required for Storage)
 *   OG_RPC_URL                  — 0G chain RPC URL (required for Storage + Indexer)
 *   OG_FEED_CONTRACT_ADDRESS    — deployed FeedEvents contract address (optional;
 *                                  enables Indexer reorg-safety when set)
 *   OG_FEED_NAMESPACE           — storage namespace prefix (default: "live-feed")
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
// Minimal FeedEvents ABI (mirrors K1 ai-oracle Anchor.sol convention)
// ---------------------------------------------------------------------------

const FEED_EVENTS_ABI = [
  {
    name: "PostPublished",
    type: "event",
    inputs: [
      { name: "root",      type: "bytes32", indexed: true  },
      { name: "author",    type: "address", indexed: true  },
      { name: "content",   type: "string",  indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// Singleton Storage instance
// ---------------------------------------------------------------------------

let _storage: Storage | undefined;

function getStorage(): Storage {
  if (_storage) return _storage;
  const privateKey = process.env.OG_PRIVATE_KEY;
  const rpcUrl = process.env.OG_RPC_URL;
  if (!privateKey || !rpcUrl) {
    throw new Error(
      "Missing OG_PRIVATE_KEY or OG_RPC_URL. " +
        "Both are required for the live-feed kit to upload posts to 0G Storage."
    );
  }
  const config: StorageConfig = { privateKey, rpcUrl };
  _storage = new Storage(config);
  return _storage;
}

// ---------------------------------------------------------------------------
// In-process FeedCursor with SSE broadcast
//
// REAL: posts are appended in-process and broadcast to SSE subscribers.
// REORG: when the Indexer fires onReorg (requires OG_FEED_CONTRACT_ADDRESS),
// the cursor drops the invalidated entries and broadcasts orphans to SSE.
// Without a contract address, reorg signals are never fired (storage-only mode).
// ---------------------------------------------------------------------------

class InProcessFeedCursor implements FeedCursor {
  private readonly _posts: FeedPost[] = [];
  private readonly _listeners: Array<(posts: FeedPost[], isReorg: boolean) => void> = [];

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

  /** Called when the Indexer fires onReorg — drops posts beyond the rollback block. */
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

// Module-scoped singleton cursor
const _cursor = new InProcessFeedCursor();

// ---------------------------------------------------------------------------
// FeedStorage adapter (bridges 0gkit-storage → FeedStorage interface)
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
// Indexer setup (real wiring — active only when OG_FEED_CONTRACT_ADDRESS is set)
// ---------------------------------------------------------------------------

let _indexerStarted = false;

function maybeStartIndexer(): boolean {
  if (_indexerStarted) return true;
  const contractAddress = process.env.OG_FEED_CONTRACT_ADDRESS as `0x${string}` | undefined;
  const rpcUrl = process.env.OG_RPC_URL;
  if (!contractAddress || !rpcUrl) return false; // storage-only mode

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

      // onEvent: a PostPublished event was confirmed on-chain.
      // Update the cursor entry's blockNumber to match the actual chain block,
      // ensuring the feed is ordered by on-chain event order.
      onEvent: async (event: DecodedEvent) => {
        const args = event.args as { root?: string };
        if (!args.root) return;
        const rootStr = args.root.toLowerCase();
        const posts = await _cursor.list();
        const match = posts.find(
          (p) => p.root.toLowerCase() === rootStr || p.root === rootStr
        );
        if (match) {
          match.blockNumber = event.blockNumber;
        }
      },

      // onReorg: blocks were rolled back — drop orphaned posts from the cursor.
      // The Indexer delivers the rolled-back events; we find the earliest block
      // to determine the safe rollback point.
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
      console.error(
        "[live-feed] Indexer failed to start — running in storage-only mode:",
        err
      );
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
// SSE broadcast — all SSE clients subscribed
// ---------------------------------------------------------------------------

const _sseClients = new Set<(data: string) => void>();

// Subscribe the cursor to SSE so all clients get live + orphan events
_cursor.subscribe((posts: FeedPost[], isReorg: boolean) => {
  for (const post of posts) {
    const payload = `data: ${JSON.stringify({ type: isReorg ? "orphan" : "post", post })}\n\n`;
    for (const fn of _sseClients) {
      try { fn(payload); } catch { _sseClients.delete(fn); }
    }
  }
});

// ---------------------------------------------------------------------------
// GET /api/feed
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse | Response> {
  const accept = request.headers.get("accept") ?? "";

  // SSE stream endpoint
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

        // Flush current canonical posts immediately
        void _cursor.list().then((posts: FeedPost[]) => {
          for (const post of posts) {
            send(`data: ${JSON.stringify({ type: "post", post })}\n\n`);
          }
        });

        request.signal.addEventListener("abort", () => {
          _sseClients.delete(send);
        });
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

  // Regular JSON list
  try {
    getFeed(); // ensure initialized
    const posts = await _cursor.list();
    return NextResponse.json({
      posts,
      reorgSafetyActive: _indexerStarted,
      notice: _indexerStarted
        ? undefined
        : "Storage-only mode: reorg-safety requires a deployed FeedEvents contract. Set OG_FEED_CONTRACT_ADDRESS to enable.",
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
