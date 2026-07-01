"use client";

import { useEffect, useState } from "react";
import type { NetworkStatus } from "@/lib/network";

interface Entry {
  key: string;
  value: string;
  ts: number;
}
interface PinsResp {
  ok: boolean;
  persisted?: boolean;
  entries?: Entry[];
  error?: string;
}

export function PinsPanel({ net }: { net: NetworkStatus }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [persisted, setPersisted] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = (d: PinsResp) => {
    if (d.entries) setEntries(d.entries);
    setPersisted(Boolean(d.persisted));
  };

  useEffect(() => {
    fetch("/api/pins")
      .then((r) => r.json())
      .then(load)
      .catch(() => {});
  }, []);

  async function pinSnapshot() {
    setBusy(true);
    try {
      const value = net.ok
        ? `block #${net.latestBlock} · chain ${net.chainId} · ${new Date(net.checkedAt).toUTCString()}`
        : `network unreachable · ${new Date(net.checkedAt).toUTCString()}`;
      const r = await fetch("/api/pins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: `snapshot:${Date.now()}`, value }),
      });
      load(await r.json());
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>
        Pinned snapshots <span className="badge-kit">agent-memory</span>
      </h2>
      <button onClick={pinSnapshot} disabled={busy}>
        {busy ? "Pinning…" : "Pin current snapshot"}
      </button>
      <div style={{ marginTop: "0.9rem" }}>
        {entries.length === 0 && (
          <p className="note">No pins yet — pin a snapshot to remember it.</p>
        )}
        {entries
          .slice()
          .reverse()
          .slice(0, 6)
          .map((e) => (
            <div className="stat" key={e.key}>
              <span className="k">{e.value}</span>
            </div>
          ))}
      </div>
      <p className="note" style={{ marginTop: "0.75rem" }}>
        {persisted
          ? "Persisted to 0G Storage via the agent-memory kit."
          : "In-memory only (resets on cold start). Set OG_PRIVATE_KEY to persist pins to 0G Storage."}
      </p>
    </section>
  );
}
