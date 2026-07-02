/**
 * trade-signal — SignalPanel React component
 *
 * Renders an advisory signal UI: enter an asset + recent prices, get a
 * buy/sell/hold recommendation, then optionally record a signed receipt.
 *
 * HONESTY: this panel never places an order. The action badge shows the AI's
 * RECOMMENDATION only. The attestation line reflects the REAL receipt returned
 * by the server (signature verified — NOT TEE-quote verification).
 *
 * The page renders <AdvisoryBanner /> above this panel; it is not duplicated here.
 *
 * Requires the react-app or chat adapter (POST /api/signal route).
 *
 * Usage:
 *   import { SignalPanel } from "@/components/SignalPanel";
 *   <SignalPanel />
 */

"use client";

import { useState, type FormEvent } from "react";
import { useTradeSignal, type SignalAction } from "../hooks/useTradeSignal.js";

// ---------------------------------------------------------------------------
// Action badge — advisory recommendation only (never an execution)
// ---------------------------------------------------------------------------

const ACTION_COLORS: Record<SignalAction, { bg: string; fg: string; border: string }> =
  {
    buy: { bg: "#dcfce7", fg: "#15803d", border: "#86efac" },
    sell: { bg: "#fee2e2", fg: "#b91c1c", border: "#fca5a5" },
    hold: { bg: "#f3f4f6", fg: "#374151", border: "#d1d5db" },
  };

function ActionBadge({ action }: { action: SignalAction }) {
  const c = ACTION_COLORS[action];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        borderRadius: 12,
        fontSize: "0.8rem",
        fontWeight: 700,
        textTransform: "uppercase",
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
      }}
    >
      {action}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SignalPanel
// ---------------------------------------------------------------------------

export interface SignalPanelProps {
  /** API route path. Defaults to "/api/signal". */
  apiPath?: string;
  /** Panel title. Defaults to "Trade Signal (advisory)". */
  title?: string;
}

export function SignalPanel({
  apiPath = "/api/signal",
  title = "Trade Signal (advisory)",
}: SignalPanelProps) {
  const { signal, record, isLoading, error, getSignal, logSignal } =
    useTradeSignal(apiPath);
  const [asset, setAsset] = useState("ETH");
  const [prices, setPrices] = useState("3100, 3150, 3180, 3200");

  function parsePrices(): number[] {
    return prices
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const history = parsePrices();
    if (!asset.trim() || history.length === 0) return;
    await getSignal({
      asset: asset.trim(),
      currentPrice: history[history.length - 1],
      history,
    });
  }

  async function handleLog() {
    if (!signal) return;
    await logSignal({
      asset: asset.trim(),
      action: signal.action,
      confidence: signal.confidence,
      rationale: signal.rationale,
    });
  }

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        maxWidth: 700,
        margin: "0 auto",
      }}
    >
      <h2 style={{ marginBottom: 4, fontSize: "1.25rem", fontWeight: 700 }}>{title}</h2>
      <p style={{ marginBottom: 16, fontSize: "0.8rem", color: "#6b7280" }}>
        The AI scores the asset and returns a buy/sell/hold recommendation. It never
        places an order — you decide whether to act.
      </p>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        style={{ display: "grid", gap: 8, marginBottom: 20 }}
      >
        <label style={{ fontSize: "0.8rem", color: "#374151" }}>
          Asset
          <input
            type="text"
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            disabled={isLoading}
            placeholder="ETH"
            style={{
              display: "block",
              width: "100%",
              marginTop: 4,
              padding: "8px 12px",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: "0.875rem",
            }}
          />
        </label>
        <label style={{ fontSize: "0.8rem", color: "#374151" }}>
          Recent prices (comma-separated, oldest→newest)
          <input
            type="text"
            value={prices}
            onChange={(e) => setPrices(e.target.value)}
            disabled={isLoading}
            placeholder="3100, 3150, 3180, 3200"
            style={{
              display: "block",
              width: "100%",
              marginTop: 4,
              padding: "8px 12px",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: "0.875rem",
            }}
          />
        </label>
        <button
          type="submit"
          disabled={isLoading}
          style={{
            justifySelf: "start",
            padding: "8px 16px",
            background: isLoading ? "#93c5fd" : "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: isLoading ? "not-allowed" : "pointer",
            fontSize: "0.875rem",
            fontWeight: 600,
          }}
        >
          {isLoading ? "Analyzing…" : "Get signal"}
        </button>
      </form>

      {error && (
        <p style={{ color: "#dc2626", marginBottom: 12, fontSize: "0.875rem" }}>
          Error: {error}
        </p>
      )}

      {signal && (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: 16,
            background: "#f9fafb",
          }}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}
          >
            <ActionBadge action={signal.action} />
            <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>
              confidence {signal.confidence.toFixed(2)}
            </span>
          </div>

          <p
            style={{
              margin: "0 0 12px",
              fontSize: "0.9rem",
              lineHeight: 1.6,
              color: "#111827",
              whiteSpace: "pre-wrap",
            }}
          >
            {signal.rationale}
          </p>

          <button
            onClick={() => void handleLog()}
            disabled={isLoading}
            style={{
              padding: "6px 12px",
              background: "#fff",
              color: "#2563eb",
              border: "1px solid #2563eb",
              borderRadius: 6,
              cursor: isLoading ? "not-allowed" : "pointer",
              fontSize: "0.8rem",
              fontWeight: 600,
            }}
          >
            Record attested receipt
          </button>

          {record && (
            <div
              style={{
                borderTop: "1px solid #e5e7eb",
                marginTop: 12,
                paddingTop: 10,
                fontSize: "0.75rem",
                color: "#6b7280",
              }}
            >
              <strong>✓ signature verified</strong> (operator-signed — not TEE-quote)
              <br />
              <strong>Storage root:</strong>{" "}
              <code style={{ fontFamily: "monospace" }}>
                {record.storageRef.slice(0, 26)}…
              </code>
              <br />
              <strong>Signed at:</strong> {new Date(record.receipt.ts).toLocaleString()}
            </div>
          )}
        </div>
      )}

      {!signal && !isLoading && !error && (
        <p style={{ color: "#9ca3af", fontSize: "0.875rem" }}>
          Enter an asset and recent prices to get an advisory signal.
        </p>
      )}
    </div>
  );
}
