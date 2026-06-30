/**
 * live-feed — FeedStream React component
 *
 * Renders a live, reorg-aware social feed:
 *   - Displays posts in chronological order
 *   - Highlights and removes posts rolled back by a chain reorg (orphaned posts
 *     briefly flash with a "removed by reorg" label before disappearing)
 *   - Shows a reorg-safety status badge (Indexer active vs. storage-only mode)
 *
 * The component drives its state from useLiveFeed() — it reflects the real
 * stream state; liveness is not faked.
 *
 * Usage:
 *   import { FeedStream } from "@/components/FeedStream";
 *   <FeedStream />
 */

"use client";

import { useState, type FormEvent } from "react";
import { useLiveFeed, type FeedPost } from "../hooks/useLiveFeed.js";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ReorgBadge({ active }: { active: boolean | null }) {
  if (active === null) return null;
  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 8px",
    borderRadius: 12,
    fontSize: "0.7rem",
    fontWeight: 600,
    marginBottom: 12,
    background: active ? "#d1fae5" : "#fef3c7",
    color: active ? "#065f46" : "#92400e",
    border: `1px solid ${active ? "#6ee7b7" : "#fcd34d"}`,
  };
  return (
    <span style={style}>
      {active
        ? "✓ Reorg-safe (Indexer active)"
        : "⚠ Storage-only mode — reorg-safety requires OG_FEED_CONTRACT_ADDRESS"}
    </span>
  );
}

function PostCard({ post, isOrphaned }: { post: FeedPost; isOrphaned: boolean }) {
  const date = new Date(post.ts).toLocaleString();
  const cardStyle: React.CSSProperties = {
    border: `1px solid ${isOrphaned ? "#fca5a5" : "#e5e7eb"}`,
    borderRadius: 8,
    padding: "10px 14px",
    marginBottom: 10,
    background: isOrphaned ? "#fff1f2" : "#fff",
    transition: "opacity 0.3s",
    opacity: isOrphaned ? 0.5 : 1,
    position: "relative",
  };
  return (
    <div style={cardStyle}>
      {isOrphaned && (
        <span
          style={{
            position: "absolute",
            top: 6,
            right: 10,
            fontSize: "0.65rem",
            color: "#dc2626",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Removed by reorg
        </span>
      )}
      <p style={{ margin: "0 0 6px 0", fontSize: "0.9rem", lineHeight: 1.5 }}>
        {post.content}
      </p>
      <div
        style={{
          display: "flex",
          gap: 12,
          fontSize: "0.7rem",
          color: "#6b7280",
        }}
      >
        <span>
          <strong>By:</strong> {post.author}
        </span>
        <span>{date}</span>
        <span
          title="0G Storage root"
          style={{
            fontFamily: "monospace",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          root: {post.root.slice(0, 16)}…
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FeedStream
// ---------------------------------------------------------------------------

export interface FeedStreamProps {
  /** API route prefix. Defaults to "/api/feed". */
  apiPath?: string;
  /** Component title. Defaults to "Live Feed". */
  title?: string;
}

export function FeedStream({
  apiPath = "/api/feed",
  title = "Live Feed",
}: FeedStreamProps) {
  const { posts, orphanedIds, isLoading, error, reorgSafetyActive, refresh } =
    useLiveFeed(apiPath);

  const [content, setContent] = useState("");
  const [author, setAuthor] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Submit a post
  // -------------------------------------------------------------------------

  async function handlePost(e: FormEvent) {
    e.preventDefault();
    setPostError(null);
    if (!content.trim()) {
      setPostError("Content is required.");
      return;
    }
    if (!author.trim()) {
      setPostError("Author is required.");
      return;
    }
    setPosting(true);
    try {
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim(), author: author.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setContent("");
      // author intentionally kept so the user can post again without retyping
    } catch (err) {
      setPostError(err instanceof Error ? err.message : String(err));
    } finally {
      setPosting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        maxWidth: 680,
        margin: "0 auto",
        padding: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>{title}</h2>
        <button
          onClick={() => void refresh()}
          disabled={isLoading}
          style={{
            padding: "4px 12px",
            background: "#f3f4f6",
            color: "#374151",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            cursor: isLoading ? "not-allowed" : "pointer",
            fontSize: "0.8rem",
          }}
        >
          {isLoading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <ReorgBadge active={reorgSafetyActive} />

      {/* Post form */}
      <form
        onSubmit={(e) => void handlePost(e)}
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: "12px 14px",
          marginBottom: 20,
          background: "#f9fafb",
        }}
      >
        <h3 style={{ margin: "0 0 10px 0", fontSize: "0.95rem", fontWeight: 600 }}>
          New Post
        </h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            type="text"
            placeholder="Author"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            style={{
              flex: "0 0 160px",
              padding: "6px 10px",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: "0.875rem",
            }}
          />
          <input
            type="text"
            placeholder="Write something…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            style={{
              flex: 1,
              padding: "6px 10px",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: "0.875rem",
            }}
          />
          <button
            type="submit"
            disabled={posting}
            style={{
              padding: "6px 14px",
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: posting ? "not-allowed" : "pointer",
              fontSize: "0.875rem",
              opacity: posting ? 0.6 : 1,
            }}
          >
            Post
          </button>
        </div>
        {postError && (
          <p style={{ color: "#dc2626", fontSize: "0.8rem", margin: 0 }}>{postError}</p>
        )}
      </form>

      {/* Feed */}
      {error && (
        <p style={{ color: "#dc2626", marginBottom: 12, fontSize: "0.875rem" }}>
          Error: {error}
        </p>
      )}

      {isLoading && posts.length === 0 ? (
        <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>Loading posts…</p>
      ) : posts.length === 0 && orphanedIds.size === 0 ? (
        <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
          No posts yet — be the first!
        </p>
      ) : (
        <div>
          {/* Show orphaned posts first so they flash before disappearing */}
          {posts
            .filter((p) => orphanedIds.has(p.root))
            .map((p) => (
              <PostCard key={p.root} post={p} isOrphaned={true} />
            ))}
          {posts
            .filter((p) => !orphanedIds.has(p.root))
            .map((p) => (
              <PostCard key={p.root} post={p} isOrphaned={false} />
            ))}
        </div>
      )}
    </div>
  );
}
