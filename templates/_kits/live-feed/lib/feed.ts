/**
 * live-feed — portable core
 *
 * Dependency-free: accepts injected FeedStorage and FeedCursor interfaces so
 * the lib works on every base and is fully unit-testable with mocks. Adapters
 * wire the real @foundryprotocol/0gkit-storage and @foundryprotocol/0gkit-indexer.
 *
 * Design
 * ──────
 * - post(msg) serialises the post payload to JSON, uploads to Storage (content-
 *   addressed), and appends a FeedPost cursor entry (root + metadata).
 * - stream(cb) subscribes to the injected cursor's push feed, calling cb with
 *   each new post and isOrphan=false. When the cursor signals a reorg/rollback
 *   (isOrphan=true), cb is called with the orphaned post and isOrphan=true,
 *   allowing the UI to remove it from the live view.
 *
 * Reorg-safety
 * ────────────
 * The portable lib's reorg-drop guarantee is: when the injected FeedCursor
 * fires its subscribe() callback with isOrphan=true for a set of posts, those
 * posts are NOT delivered as live items — they are surfaced as orphans so the
 * caller can remove them. This is proven by the lib tests.
 *
 * In the ADAPTER, reorg-safety requires that posts are tied to on-chain events
 * (see adapters/react-app/app/api/feed/route.ts for the honest framing of what
 * the real Indexer provides and how the adapter wires this).
 *
 * NO package imports — adapters inject implementations of these interfaces.
 */

// ---------------------------------------------------------------------------
// Injected interfaces
// ---------------------------------------------------------------------------

/** Minimal storage interface — adapters inject the real 0gkit-storage impl. */
export interface FeedStorage {
  /**
   * Upload a blob; returns an immutable content-addressed root string.
   * Mirror of @foundryprotocol/0gkit-storage Storage.upload().
   */
  upload(data: Uint8Array): Promise<{ root: string }>;

  /**
   * Download a blob by its root. Returns undefined if not found.
   * Mirror of @foundryprotocol/0gkit-storage Storage.download().
   */
  download(root: string): Promise<Uint8Array | undefined>;
}

/**
 * A single post entry as stored in the cursor.
 * The `root` is the 0G Storage root hash pointing to the full post payload.
 * `content` and `author` are denormalized into the cursor entry for fast list
 * rendering without a Storage download per post.
 */
export interface FeedPost {
  /** 0G Storage root hash of the full post payload blob. */
  root: string;
  /** Denormalized post text (for fast rendering without a Storage round-trip). */
  content: string;
  /** Author identifier (address, handle, etc.). */
  author: string;
  /** Creation timestamp (Unix ms). */
  ts: number;
  /**
   * Block number at which this post's on-chain event was indexed.
   * In the portable lib, this is an opaque ordering key (monotonic integer).
   * In the real adapter, this is the actual EVM block number from the Indexer.
   */
  blockNumber: bigint;
}

/**
 * Callback type for stream() consumers.
 * @param post     The FeedPost being delivered.
 * @param isOrphan true when this post was rolled back by a reorg — the caller
 *                 should remove it from the displayed feed, not add it.
 */
export type FeedStreamCallback = (post: FeedPost, isOrphan: boolean) => void;

/**
 * Injected cursor interface.
 *
 * The lib only requires this minimal surface. The real adapter wires the
 * Indexer's onEvent/onReorg callbacks to an in-process implementation of this
 * interface that bridges on-chain events → FeedPost entries. See the adapter
 * for how the real Indexer's reorg-safety flows through this seam.
 */
export interface FeedCursor {
  /** Append a new post to the cursor (called by post()). */
  append(post: FeedPost): Promise<void>;

  /**
   * Subscribe to the live post stream.
   *
   * @param onBatch  Called with (posts, isReorg):
   *   - isReorg=false: new canonical posts (emit as live items)
   *   - isReorg=true:  posts that were just rolled back (drop from the UI)
   * @returns unsubscribe function
   */
  subscribe(
    onBatch: (posts: FeedPost[], isReorg: boolean) => void
  ): () => void;

  /** Returns all current (non-orphaned) posts in ascending order. */
  list(): Promise<FeedPost[]>;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface PostInput {
  content: string;
  author: string;
}

export interface FeedOptions {
  storage: FeedStorage;
  cursor: FeedCursor;
  /**
   * Optional block-number generator used in the lib only.
   * Adapters inject the real block number from the Indexer's DecodedEvent.
   * Default: monotonically increasing counter starting at 0.
   */
  nextBlockNumber?: () => bigint;
}

// ---------------------------------------------------------------------------
// createFeed
// ---------------------------------------------------------------------------

export interface Feed {
  /**
   * Publish a post: serialise + upload to Storage, append to cursor.
   * Throws if content is empty.
   */
  post(input: PostInput): Promise<FeedPost>;

  /**
   * Subscribe to the live post stream.
   *
   * On subscribe, all existing posts are flushed to cb immediately
   * (isOrphan=false). New posts arrive in real time. On a reorg signal, the
   * orphaned posts arrive with isOrphan=true so the UI can remove them.
   *
   * @returns unsubscribe function
   */
  stream(cb: FeedStreamCallback): () => void;
}

export function createFeed({ storage, cursor, nextBlockNumber }: FeedOptions): Feed {
  // Monotonic block-number counter for lib-only use
  let _blockCounter = 0n;
  const _nextBlock = nextBlockNumber ?? (() => _blockCounter++);

  // -------------------------------------------------------------------------
  // post()
  // -------------------------------------------------------------------------

  async function post({ content, author }: PostInput): Promise<FeedPost> {
    if (!content || content.trim() === "") {
      throw new Error("live-feed: post content must not be empty");
    }

    const ts = Date.now();
    // Serialise the full payload to Storage
    const payload = JSON.stringify({ content, author, ts });
    const encoded = new TextEncoder().encode(payload);
    const { root } = await storage.upload(encoded);

    const feedPost: FeedPost = {
      root,
      content,
      author,
      ts,
      blockNumber: _nextBlock(),
    };

    // Append to cursor (triggers subscribe listeners)
    await cursor.append(feedPost);
    return feedPost;
  }

  // -------------------------------------------------------------------------
  // stream()
  // -------------------------------------------------------------------------

  function stream(cb: FeedStreamCallback): () => void {
    // Subscribe to live updates first (before flushing existing posts) so we
    // don't miss posts that arrive during the flush
    const unsub = cursor.subscribe((posts, isReorg) => {
      for (const p of posts) {
        cb(p, isReorg);
      }
    });

    // Flush existing posts asynchronously
    void cursor.list().then((existing) => {
      for (const p of existing) {
        cb(p, false);
      }
    });

    return unsub;
  }

  return { post, stream };
}
