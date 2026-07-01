"use client";

import { useEffect, useState } from "react";

interface Post {
  root: string;
  content: string;
  author: string;
  ts: number;
  blockNumber: string;
}
interface FeedResp {
  ok: boolean;
  reorgSafe?: boolean;
  posts?: Post[];
}

export function FeedPanel() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [reorgSafe, setReorgSafe] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = (d: FeedResp) => {
    if (d.posts) setPosts(d.posts);
    setReorgSafe(Boolean(d.reorgSafe));
  };

  useEffect(() => {
    fetch("/api/feed")
      .then((r) => r.json())
      .then(load)
      .catch(() => {});
  }, []);

  async function post() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/feed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: text.trim(), author: "visitor" }),
      });
      load(await r.json());
      setText("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>
        Live feed <span className="badge-kit">live-feed</span>
      </h2>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Say something to the feed…"
          onKeyDown={(e) => e.key === "Enter" && post()}
          maxLength={280}
        />
        <button onClick={post} disabled={busy}>
          {busy ? "…" : "Post"}
        </button>
      </div>
      <div style={{ marginTop: "0.9rem" }}>
        {posts.length === 0 && <p className="note">No posts yet — be the first.</p>}
        {posts
          .slice()
          .reverse()
          .slice(0, 6)
          .map((p) => (
            <div className="stat" key={p.root}>
              <span className="k">{p.content}</span>
              <span className="v" style={{ color: "var(--fg-muted)" }}>
                {p.author}
              </span>
            </div>
          ))}
      </div>
      <p className="note" style={{ marginTop: "0.75rem" }}>
        {reorgSafe
          ? "Reorg-safe — backed by 0gkit-indexer on a deployed FeedEvents contract."
          : "Storage-only demo mode. Set OG_FEED_CONTRACT_ADDRESS (deployed FeedEvents) to enable reorg-safe indexing. Posts reset on cold start."}
      </p>
    </section>
  );
}
