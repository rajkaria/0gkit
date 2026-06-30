/**
 * live-feed — useLiveFeed React hook
 *
 * Connects to the /api/feed SSE endpoint for real-time post delivery and
 * reorg-aware feed state. Reflects the real stream state:
 *   - posts:        canonical posts in ascending order
 *   - orphanedIds:  set of post roots that were rolled back (for UI highlighting)
 *   - isLoading:    true while the initial snapshot is being fetched
 *   - error:        last fetch/SSE error message
 *   - reorgSafetyActive: whether the Indexer is wired (from the initial JSON fetch)
 *
 * On a reorg signal (SSE event type: "orphan"), the orphaned post root is added
 * to orphanedIds; the post stays in the feed for a brief 5s flash window (so the
 * UI can render the "removed by reorg" label on it), then it is removed from both
 * orphanedIds and the canonical posts list when the timer fires.
 *
 * Usage:
 *   const { posts, isLoading, error, reorgSafetyActive } = useLiveFeed();
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types (duplicated from lib to keep the UI layer self-contained)
// ---------------------------------------------------------------------------

export interface FeedPost {
  root: string;
  content: string;
  author: string;
  ts: number;
  blockNumber: string; // bigint serialises as string over the wire
}

export interface UseLiveFeedResult {
  /** Canonical posts in ascending timestamp order. */
  posts: FeedPost[];
  /** Roots of posts removed by a chain reorg (cleared after 5 seconds). */
  orphanedIds: Set<string>;
  isLoading: boolean;
  error: string | null;
  /**
   * Whether the Indexer is wired and providing real reorg-safety.
   * false = storage-only mode (posts are stored but reorg-drop is not active).
   * null = not yet determined (loading).
   */
  reorgSafetyActive: boolean | null;
  /** Manually re-fetch the snapshot (does not re-open SSE). */
  refresh: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useLiveFeed(
  /** API route prefix. Defaults to "/api/feed". */
  apiPath = "/api/feed"
): UseLiveFeedResult {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [orphanedIds, setOrphanedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reorgSafetyActive, setReorgSafetyActive] = useState<boolean | null>(null);

  // Track active orphan-clear timers so we can clean up on unmount
  const orphanTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // -------------------------------------------------------------------------
  // Initial snapshot (JSON fetch — also surfaces reorgSafetyActive)
  // -------------------------------------------------------------------------

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(apiPath, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        posts?: FeedPost[];
        error?: string;
        reorgSafetyActive?: boolean;
      };
      if (data.error) throw new Error(data.error);
      setPosts(data.posts ?? []);
      if (typeof data.reorgSafetyActive === "boolean") {
        setReorgSafetyActive(data.reorgSafetyActive);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [apiPath]);

  // -------------------------------------------------------------------------
  // SSE subscription for live updates
  // -------------------------------------------------------------------------

  useEffect(() => {
    // Initial snapshot
    void refresh();

    const es = new EventSource(apiPath);

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type: "post" | "orphan";
          post: FeedPost;
        };

        if (msg.type === "post") {
          // Canonical post: add to feed if not already present
          setPosts((prev) => {
            if (prev.some((p) => p.root === msg.post.root)) return prev;
            return [...prev, msg.post].sort((a, b) => a.ts - b.ts);
          });
        } else if (msg.type === "orphan") {
          // Reorg: flag the post as orphaned so the UI flashes it with a
          // "removed by reorg" label. Keep it in `posts` during the flash
          // window so FeedStream's orphaned-post section actually renders it;
          // the timer below drops it from both the orphan set and the feed.
          setOrphanedIds((prev) => {
            const next = new Set(prev);
            next.add(msg.post.root);
            return next;
          });

          // After the 5s flash, remove the post from the feed and clear the flag.
          const existing = orphanTimers.current.get(msg.post.root);
          if (existing) clearTimeout(existing);
          const timer = setTimeout(() => {
            setPosts((prev) => prev.filter((p) => p.root !== msg.post.root));
            setOrphanedIds((prev) => {
              const next = new Set(prev);
              next.delete(msg.post.root);
              return next;
            });
            orphanTimers.current.delete(msg.post.root);
          }, 5000);
          orphanTimers.current.set(msg.post.root, timer);
        }
      } catch {
        // Malformed SSE message — ignore
      }
    };

    es.onerror = () => {
      setError("Live stream disconnected — retrying…");
      // EventSource auto-reconnects; clear error on next message
    };

    es.addEventListener("open", () => {
      setError(null);
    });

    return () => {
      es.close();
      // Clear all orphan timers
      for (const timer of orphanTimers.current.values()) clearTimeout(timer);
      orphanTimers.current.clear();
    };
  }, [apiPath, refresh]);

  return { posts, orphanedIds, isLoading, error, reorgSafetyActive, refresh };
}
