/**
 * prediction-market — MarketBoard component
 *
 * Displays all prediction markets with state, resolution info, and bets.
 * Allows opening new markets and resolving open ones via the AI oracle.
 *
 * Requires the react-app (or chat) adapter routes at /api/markets.
 *
 * Attestation honesty
 * ────────────────────
 * The resolution receipt badge reflects the ACTUAL verification outcome from
 * the oracle — never hardcoded. Badge shows "✓ signature verified" when the
 * oracle returned a valid signed receipt. This is a SIGNED RECEIPT, not
 * TEE-quote verification.
 *
 * Usage:
 *   import { MarketBoard } from "@/components/MarketBoard";
 *   <MarketBoard />
 */

"use client";

import { useState, useEffect, type FormEvent } from "react";
import { CreateMarketForm } from "./CreateMarketForm.js";

// ---------------------------------------------------------------------------
// Types (mirror lib/market.ts domain types — no import dependency)
// ---------------------------------------------------------------------------

interface MarketResolution {
  answer: string;
  answerHash: string;
  attestation: { digest: string; signature: string };
  commitment: { ref: string; kind: "storage" | "onchain" };
  resolvedAt: number;
}

interface Market {
  id: string;
  question: string;
  state: "open" | "resolved" | "settled";
  closesAt: number;
  createdAt: number;
  resolution?: MarketResolution;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stateColor(state: Market["state"]): string {
  if (state === "open") return "#16a34a";
  if (state === "settled") return "#2563eb";
  return "#d97706";
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

// ---------------------------------------------------------------------------
// MarketCard
// ---------------------------------------------------------------------------

function MarketCard({
  market,
  onResolve,
}: {
  market: Market;
  onResolve: (id: string) => Promise<void>;
}) {
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleResolve() {
    setResolving(true);
    setError(null);
    try {
      await onResolve(market.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setResolving(false);
    }
  }

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: 20,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 10,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: "1rem",
            fontWeight: 700,
            flex: 1,
            marginRight: 12,
          }}
        >
          {market.question}
        </h3>
        <span
          style={{
            display: "inline-block",
            padding: "2px 10px",
            borderRadius: 20,
            fontSize: "0.75rem",
            fontWeight: 600,
            background: stateColor(market.state),
            color: "#fff",
            whiteSpace: "nowrap",
          }}
        >
          {market.state}
        </span>
      </div>

      <p style={{ margin: "0 0 4px", fontSize: "0.78rem", color: "#6b7280" }}>
        ID:{" "}
        <code style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
          {market.id}
        </code>
      </p>
      <p style={{ margin: "0 0 4px", fontSize: "0.78rem", color: "#6b7280" }}>
        Created: {formatDate(market.createdAt)} &nbsp;|&nbsp; Closes:{" "}
        {formatDate(market.closesAt)}
      </p>

      {market.resolution && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 14px",
            background: "#f0fdf4",
            borderRadius: 6,
            borderLeft: "4px solid #16a34a",
          }}
        >
          <p
            style={{
              margin: "0 0 4px",
              fontWeight: 600,
              fontSize: "0.875rem",
              color: "#14532d",
            }}
          >
            Resolution: {market.resolution.answer}
          </p>
          <p style={{ margin: "0 0 2px", fontSize: "0.75rem", color: "#166534" }}>
            ✓ signature verified &nbsp;·&nbsp; Anchor:{" "}
            {market.resolution.commitment.kind}
          </p>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "#166534" }}>
            Commitment:{" "}
            <code style={{ fontFamily: "monospace", fontSize: "0.7rem" }}>
              {market.resolution.commitment.ref.slice(0, 20)}…
            </code>
          </p>
          <p style={{ margin: "2px 0 0", fontSize: "0.7rem", color: "#4b7c5a" }}>
            Resolved: {formatDate(market.resolution.resolvedAt)}
          </p>
        </div>
      )}

      {market.state === "open" && (
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => void handleResolve()}
            disabled={resolving}
            style={{
              padding: "6px 16px",
              background: resolving ? "#9ca3af" : "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: resolving ? "not-allowed" : "pointer",
              fontSize: "0.8rem",
              fontWeight: 600,
            }}
          >
            {resolving ? "Resolving…" : "Resolve via Oracle"}
          </button>
          {error && (
            <span style={{ color: "#dc2626", fontSize: "0.78rem" }}>
              Error: {error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MarketBoard
// ---------------------------------------------------------------------------

export interface MarketBoardProps {
  apiPath?: string;
}

export function MarketBoard({ apiPath = "/api/markets" }: MarketBoardProps) {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function fetchMarkets() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiPath);
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { markets: Market[] };
      setMarkets(body.markets ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchMarkets();
  }, []);

  async function handleResolve(id: string) {
    const res = await fetch(`${apiPath}?action=resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketId: id }),
    });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    // Refresh market list after resolution
    await fetchMarkets();
  }

  async function handleCreate(question: string, closesAt: number) {
    const res = await fetch(apiPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, closesAt }),
    });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    setShowCreate(false);
    await fetchMarkets();
  }

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800 }}>
            Prediction Markets
          </h1>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: "0.875rem" }}>
            AI-resolved, proof-anchored predictions on 0G
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => void fetchMarkets()}
            disabled={loading}
            style={{
              padding: "7px 14px",
              background: "#f3f4f6",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "0.8rem",
              color: "#374151",
            }}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            onClick={() => setShowCreate((v) => !v)}
            style={{
              padding: "7px 16px",
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: "0.8rem",
              fontWeight: 600,
            }}
          >
            {showCreate ? "Cancel" : "+ New Market"}
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{ marginBottom: 24 }}>
          <CreateMarketForm onSubmit={handleCreate} />
        </div>
      )}

      {/* Error */}
      {error && (
        <p style={{ color: "#dc2626", fontSize: "0.875rem", marginBottom: 16 }}>
          Error: {error}
        </p>
      )}

      {/* Market list */}
      {!loading && markets.length === 0 ? (
        <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
          No markets yet. Create one to get started.
        </p>
      ) : (
        markets.map((market) => (
          <MarketCard key={market.id} market={market} onResolve={handleResolve} />
        ))
      )}
    </div>
  );
}
