"use client";
import { useEffect, useMemo, useState } from "react";
import { useEvent } from "@foundryprotocol/0gkit-react";
import { MESSAGE_REGISTRY_ABI, MESSAGE_REGISTRY_ADDRESS } from "@/lib/contract";
import { decodeMessage } from "@/lib/message";

interface PostedRow {
  author: string;
  root: `0x${string}`;
  ts: bigint;
  blockNumber: bigint;
}

export default function Home() {
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [bodies, setBodies] = useState<Record<string, string>>({});

  const contract = useMemo(
    () => ({ address: MESSAGE_REGISTRY_ADDRESS, abi: MESSAGE_REGISTRY_ABI }),
    []
  );

  const { events, isLoading, error } = useEvent({
    contract,
    event: "MessagePosted",
    fromBlock: 0n,
  });

  const rows: PostedRow[] = events.map((e) => {
    const args = (e.args ?? {}) as Record<string, unknown>;
    return {
      author: String(args.author ?? "0x"),
      root: (args.root ?? "0x") as `0x${string}`,
      ts: typeof args.ts === "bigint" ? args.ts : BigInt(args.ts as number),
      blockNumber: e.blockNumber,
    };
  });

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      for (const row of rows) {
        if (bodies[row.root]) continue;
        try {
          const res = await fetch(`/api/post?root=${row.root}`);
          if (!res.ok) continue;
          const blob = new Uint8Array(await res.arrayBuffer());
          const m = decodeMessage(blob);
          if (!cancelled) setBodies((prev) => ({ ...prev, [row.root]: m.body }));
        } catch {
          /* leave unhydrated; UI shows a placeholder */
        }
      }
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, [rows, bodies]);

  async function send() {
    if (!draft.trim()) return;
    setPosting(true);
    try {
      const res = await fetch("/api/post", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`Post failed: ${(j as { error?: string }).error ?? res.statusText}`);
      } else {
        setDraft("");
      }
    } finally {
      setPosting(false);
    }
  }

  return (
    <main>
      <h1>0gkit chat</h1>
      <p style={{ color: "#666" }}>
        Messages persist on 0G Storage; the on-chain MessagePosted event log is the
        source of truth for the feed.
      </p>

      {error ? (
        <p style={{ color: "crimson" }}>Indexer error: {error.message}</p>
      ) : null}
      {isLoading ? <p>Loading feed…</p> : null}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {rows.map((r) => (
          <li
            key={`${r.blockNumber}-${r.root}`}
            style={{
              border: "1px solid #ddd",
              padding: "0.5rem",
              margin: "0.5rem 0",
              borderRadius: 4,
            }}
          >
            <div style={{ fontSize: "0.8rem", color: "#888" }}>
              {r.author.slice(0, 10)}… · block {String(r.blockNumber)}
            </div>
            <div>
              {bodies[r.root] ?? <em>(loading body…)</em>}
            </div>
          </li>
        ))}
      </ul>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="say something to the chain…"
        rows={3}
        style={{ width: "100%" }}
      />
      <button onClick={send} disabled={posting || !draft.trim()}>
        {posting ? "Posting…" : "Post"}
      </button>
    </main>
  );
}
