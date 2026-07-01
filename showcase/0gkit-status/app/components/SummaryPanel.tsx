"use client";

import { useEffect, useState } from "react";
import type { NetworkStatus } from "@/lib/network";

interface SummaryResp {
  configured?: boolean;
  reason?: string;
  summary?: string | null;
  mode?: string;
  model?: string;
  provider?: string;
  error?: string;
}

export function SummaryPanel({ net }: { net: NetworkStatus }) {
  const [data, setData] = useState<SummaryResp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/summary")
      .then((r) => r.json())
      .then((d: SummaryResp) => alive && setData(d))
      .catch((e) => alive && setData({ error: String(e) }))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="panel">
      <h2>
        AI summary <span className="badge-kit">Compute.router()</span>
      </h2>
      {loading && <p className="note">Asking the 0G Router…</p>}
      {!loading && data?.configured === false && <p className="note">{data.reason}</p>}
      {!loading && data?.summary && (
        <>
          <p style={{ margin: "0 0 0.6rem", lineHeight: 1.5 }}>{data.summary}</p>
          <p className="note">
            {data.mode} · model <code>{data.model}</code>
            {data.provider ? (
              <>
                {" "}
                · provider <code>{data.provider.slice(0, 10)}…</code>
              </>
            ) : null}
          </p>
        </>
      )}
      {!loading && data?.configured && !data.summary && (
        <p className="note">
          Router configured, but no summary this time — honest error:
          <br />
          <code>{data.error}</code>
        </p>
      )}
      {!net.ok && (
        <p className="note" style={{ marginTop: "0.6rem" }}>
          (Network is unreachable, so any summary reflects that.)
        </p>
      )}
    </section>
  );
}
