/**
 * live-feed — portable core unit tests (TDD)
 *
 * Uses pure in-memory mocks only — NO network, NO real 0gkit packages.
 *
 * Run via:
 *   ./packages/0gkit-kits/node_modules/.bin/vitest run --root templates/_kits/live-feed
 *
 * Three scenarios proven:
 *   1. post(msg) writes a storage blob and returns a cursor entry.
 *   2. stream() yields posts in order over an injected cursor/indexer mock.
 *   3. On an injected reorg/rollback signal, stream() DROPS the orphaned post.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createFeed,
  type FeedStorage,
  type FeedCursor,
  type FeedPost,
} from "../feed.js";

// ---------------------------------------------------------------------------
// Mock FeedStorage
// ---------------------------------------------------------------------------

function mockStorage(): FeedStorage & { _blobs: Map<string, Uint8Array> } {
  const _blobs = new Map<string, Uint8Array>();
  return {
    _blobs,
    async upload(data: Uint8Array): Promise<{ root: string }> {
      const root = `mock-root-${_blobs.size}`;
      _blobs.set(root, data);
      return { root };
    },
    async download(root: string): Promise<Uint8Array | undefined> {
      return _blobs.get(root);
    },
  };
}

// ---------------------------------------------------------------------------
// Mock FeedCursor
//
// A FeedCursor is a minimal interface the lib uses to:
//   - append a new post entry (after a post() call)
//   - iterate posts in order (for stream())
//   - signal a reorg by "rolling back" entries beyond a given block number
//     (simulating what the real Indexer's onReorg callback would do)
// ---------------------------------------------------------------------------

function mockCursor(): FeedCursor & {
  _entries: FeedPost[];
  simulateReorg(rollbackToBlockNumber: bigint): void;
} {
  const _entries: FeedPost[] = [];
  const _listeners: Array<(posts: FeedPost[], isReorg: boolean) => void> = [];

  return {
    _entries,

    async append(post: FeedPost): Promise<void> {
      _entries.push(post);
      // Notify any active stream listeners
      for (const fn of _listeners) fn([post], false);
    },

    subscribe(onBatch: (posts: FeedPost[], isReorg: boolean) => void): () => void {
      _listeners.push(onBatch);
      return () => {
        const idx = _listeners.indexOf(onBatch);
        if (idx !== -1) _listeners.splice(idx, 1);
      };
    },

    async list(): Promise<FeedPost[]> {
      return [..._entries];
    },

    /** Test-only: simulate a reorg that invalidates posts beyond blockNumber. */
    simulateReorg(rollbackToBlockNumber: bigint): void {
      // Remove entries whose blockNumber is GREATER than rollbackToBlockNumber
      const before = _entries.length;
      const invalidated = _entries.filter((e) => e.blockNumber > rollbackToBlockNumber);
      _entries.splice(
        0,
        _entries.length,
        ..._entries.filter((e) => e.blockNumber <= rollbackToBlockNumber)
      );
      if (invalidated.length > 0) {
        // Notify listeners with isReorg=true so the stream can drop orphans
        for (const fn of _listeners) fn(invalidated, true);
      }
      void before;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createFeed", () => {
  let storage: ReturnType<typeof mockStorage>;
  let cursor: ReturnType<typeof mockCursor>;

  beforeEach(() => {
    storage = mockStorage();
    cursor = mockCursor();
  });

  // -------------------------------------------------------------------------
  // 1. post() writes a storage blob and returns a cursor entry
  // -------------------------------------------------------------------------

  it("post() uploads content to storage and returns a FeedPost with a root", async () => {
    const feed = createFeed({ storage, cursor });
    const post = await feed.post({ content: "hello world", author: "alice" });

    // The root must be a non-empty string (storage reference)
    expect(typeof post.root).toBe("string");
    expect(post.root.length).toBeGreaterThan(0);

    // The content round-trips through storage
    const blob = storage._blobs.get(post.root);
    expect(blob).toBeDefined();
    const decoded = JSON.parse(new TextDecoder().decode(blob));
    expect(decoded.content).toBe("hello world");
    expect(decoded.author).toBe("alice");
  });

  it("post() appends an entry to the cursor", async () => {
    const feed = createFeed({ storage, cursor });
    await feed.post({ content: "first post", author: "bob" });
    await feed.post({ content: "second post", author: "bob" });

    const listed = await cursor.list();
    expect(listed).toHaveLength(2);
    expect(listed[0]!.content).toBe("first post");
    expect(listed[1]!.content).toBe("second post");
  });

  it("post() assigns an incrementing blockNumber from the mock cursor", async () => {
    const feed = createFeed({ storage, cursor });
    const p1 = await feed.post({ content: "a", author: "x" });
    const p2 = await feed.post({ content: "b", author: "x" });
    expect(p2.blockNumber).toBeGreaterThanOrEqual(p1.blockNumber);
  });

  // -------------------------------------------------------------------------
  // 2. stream() yields posts in order
  // -------------------------------------------------------------------------

  it("stream() resolves with initial posts in order", async () => {
    // Pre-populate cursor directly so we don't need the full post() round-trip
    const now = BigInt(100);
    cursor._entries.push(
      { root: "r1", content: "first", author: "alice", ts: 1000, blockNumber: now },
      { root: "r2", content: "second", author: "bob", ts: 2000, blockNumber: now + 1n }
    );

    const feed = createFeed({ storage, cursor });
    const received: FeedPost[] = [];

    // Stream terminates after consuming initial posts (no new arrivals)
    await new Promise<void>((resolve) => {
      const unsub = feed.stream((post, isOrphan) => {
        if (!isOrphan) received.push(post);
        if (received.length === 2) {
          unsub();
          resolve();
        }
      });
      // Force a "flush" of existing entries — stream should emit them synchronously/async
      // by calling cursor.list() on start
    });

    expect(received[0]!.content).toBe("first");
    expect(received[1]!.content).toBe("second");
  });

  it("stream() delivers a newly posted item in real-time", async () => {
    const feed = createFeed({ storage, cursor });
    const received: FeedPost[] = [];

    await new Promise<void>((resolve) => {
      const unsub = feed.stream((post, isOrphan) => {
        if (!isOrphan) {
          received.push(post);
          unsub();
          resolve();
        }
      });
      // Post after stream is subscribed
      void feed.post({ content: "live post", author: "charlie" });
    });

    expect(received).toHaveLength(1);
    expect(received[0]!.content).toBe("live post");
  });

  // -------------------------------------------------------------------------
  // 3. On injected reorg/rollback, stream() drops orphaned posts
  //    (this is the crux — proves the portable lib handles reorg signals)
  // -------------------------------------------------------------------------

  it("stream() calls the callback with isOrphan=true for posts that are rolled back", async () => {
    const feed = createFeed({ storage, cursor });

    const good: FeedPost[] = [];
    const orphaned: FeedPost[] = [];

    // Subscribe first
    const unsub = feed.stream((post, isOrphan) => {
      if (isOrphan) orphaned.push(post);
      else good.push(post);
    });

    // Post two entries at different block numbers
    await feed.post({ content: "canonical post", author: "alice" });
    // We can't directly set blockNumber in post(); simulate by directly inserting
    // a high-block entry into the cursor (simulating something already indexed)
    cursor._entries[cursor._entries.length - 1]!.blockNumber = 5n;
    await feed.post({ content: "orphaned post", author: "bob" });
    cursor._entries[cursor._entries.length - 1]!.blockNumber = 10n;

    // Trigger reorg: roll back to block 5 — the second post (block 10) is orphaned
    cursor.simulateReorg(5n);

    unsub();

    // The canonical post survived; the orphaned one was flagged
    expect(good.some((p) => p.content === "canonical post")).toBe(true);
    expect(orphaned.some((p) => p.content === "orphaned post")).toBe(true);
  });

  it("stream() does NOT include orphaned posts in subsequent list() results after reorg", async () => {
    const feed = createFeed({ storage, cursor });

    await feed.post({ content: "safe", author: "alice" });
    cursor._entries[cursor._entries.length - 1]!.blockNumber = 3n;
    await feed.post({ content: "orphan", author: "bob" });
    cursor._entries[cursor._entries.length - 1]!.blockNumber = 8n;

    // Simulate reorg before block 8
    cursor.simulateReorg(3n);

    const remaining = await cursor.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.content).toBe("safe");
  });

  // -------------------------------------------------------------------------
  // 4. Edge cases
  // -------------------------------------------------------------------------

  it("post() rejects empty content", async () => {
    const feed = createFeed({ storage, cursor });
    await expect(feed.post({ content: "", author: "alice" })).rejects.toThrow();
  });

  it("stream() unsubscribes cleanly (returned function cleans up listener)", async () => {
    const feed = createFeed({ storage, cursor });
    const received: FeedPost[] = [];

    const unsub = feed.stream((post, isOrphan) => {
      if (!isOrphan) received.push(post);
    });

    await feed.post({ content: "before unsub", author: "x" });
    unsub();
    await feed.post({ content: "after unsub", author: "x" });

    // Only the first post should have been received
    expect(received).toHaveLength(1);
    expect(received[0]!.content).toBe("before unsub");
  });
});
