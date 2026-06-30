/**
 * yield-intel — Yield Intelligence page
 *
 * HONESTY INVARIANTS (page-level)
 * ─────────────────────────────────
 * 1. <DemoBanner /> is rendered UNCONDITIONALLY at the TOP of the page — always
 *    the first visible element. It is non-removable.
 * 2. There is NO execute/trade/swap/send/transfer button or action anywhere.
 * 3. No "guaranteed"/"profit"/"risk-free" copy.
 * 4. Testnet: Galileo (OG_NETWORK=galileo default).
 *
 * Flow:
 *   1. User inputs their DeFi positions.
 *   2. Clicks "Analyse" — calls POST /api/yield { action: "analyze" }.
 *   3. AI returns ranked analysis displayed in YieldTable.
 *   4. User optionally logs their intended decision via DecisionLog.
 *   5. DecisionLog calls POST /api/yield { action: "log" } — attested record
 *      persisted to 0G Storage. No transaction is executed.
 */

"use client";

import { useState, type FormEvent } from "react";
import { DemoBanner } from "../../components/DemoBanner.js";
import {
  YieldTable,
  type AnalysisItem,
  type Position,
} from "../../components/YieldTable.js";
import { DecisionLog } from "../../components/DecisionLog.js";

// ---------------------------------------------------------------------------
// Sample positions for the demo form
// ---------------------------------------------------------------------------

const DEMO_POSITIONS: Position[] = [
  { id: "pos-1", protocol: "Compound", asset: "ETH", amount: 1.5, apy: 4.2 },
  { id: "pos-2", protocol: "Aave", asset: "USDC", amount: 500, apy: 6.1 },
  { id: "pos-3", protocol: "Uniswap V3", asset: "ETH/USDC", amount: 200, apy: 12.8 },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function YieldPage() {
  const [positions, setPositions] = useState<Position[]>(DEMO_POSITIONS);
  const [positionsJson, setPositionsJson] = useState(
    JSON.stringify(DEMO_POSITIONS, null, 2)
  );
  const [parseError, setParseError] = useState<string | null>(null);

  const [isAnalysing, setIsAnalysing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [items, setItems] = useState<AnalysisItem[]>([]);

  const [selectedPositionId, setSelectedPositionId] = useState("");

  function handlePositionsChange(raw: string) {
    setPositionsJson(raw);
    try {
      const parsed = JSON.parse(raw) as Position[];
      if (!Array.isArray(parsed)) throw new Error("Expected an array.");
      setPositions(parsed);
      setParseError(null);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Invalid JSON");
    }
  }

  async function handleAnalyse(e: FormEvent) {
    e.preventDefault();
    if (parseError || positions.length === 0) return;

    setIsAnalysing(true);
    setAnalysisError(null);
    setItems([]);

    try {
      const res = await fetch("/api/yield", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze", positions }),
      });
      const data = (await res.json()) as { items?: AnalysisItem[]; error?: string };
      if (!res.ok || data.error) {
        setAnalysisError(data.error ?? "Unknown error");
      } else {
        setItems(data.items ?? []);
        if (data.items && data.items.length > 0) {
          setSelectedPositionId(data.items[0].id);
        }
      }
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setIsAnalysing(false);
    }
  }

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        maxWidth: 900,
        margin: "0 auto",
        padding: 24,
      }}
    >
      {/* ── NON-REMOVABLE DemoBanner — page LEADS with this disclaimer ── */}
      <DemoBanner />

      <h1 style={{ margin: "0 0 4px", fontSize: "1.5rem", fontWeight: 800 }}>
        Yield Intelligence
      </h1>
      <p style={{ margin: "0 0 24px", fontSize: "0.875rem", color: "#6b7280" }}>
        AI-powered read-only yield analysis. Enter your positions, get a ranked analysis
        with rationale, then optionally log your intended action (attestation anchored
        to 0G Storage — Galileo testnet).
        <strong style={{ color: "#374151" }}> No automated execution.</strong>
      </p>

      {/* ── Position input ─────────────────────────────────────────────── */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 8 }}>
          1. Enter your positions
        </h2>
        <form onSubmit={(e) => void handleAnalyse(e)}>
          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                display: "block",
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "#374151",
                marginBottom: 4,
              }}
            >
              Positions JSON (array of {"{id, protocol, asset, amount, apy}"})
            </label>
            <textarea
              value={positionsJson}
              onChange={(e) => handlePositionsChange(e.target.value)}
              rows={8}
              style={{
                width: "100%",
                padding: "8px 10px",
                border: `1px solid ${parseError ? "#f87171" : "#d1d5db"}`,
                borderRadius: 6,
                fontFamily: "monospace",
                fontSize: "0.8rem",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
            {parseError && (
              <p style={{ margin: "4px 0 0", color: "#dc2626", fontSize: "0.75rem" }}>
                Parse error: {parseError}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isAnalysing || !!parseError || positions.length === 0}
            style={{
              padding: "9px 20px",
              background:
                isAnalysing || !!parseError || positions.length === 0
                  ? "#93c5fd"
                  : "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor:
                isAnalysing || !!parseError || positions.length === 0
                  ? "not-allowed"
                  : "pointer",
              fontSize: "0.875rem",
              fontWeight: 600,
            }}
          >
            {isAnalysing ? "Analysing…" : "Analyse Positions"}
          </button>
        </form>
      </section>

      {/* ── Analysis results ────────────────────────────────────────────── */}
      {analysisError && (
        <p style={{ color: "#dc2626", fontSize: "0.875rem", marginBottom: 16 }}>
          Analysis error: {analysisError}
        </p>
      )}

      {items.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 12 }}>
            2. AI yield analysis (read-only)
          </h2>
          <YieldTable items={items} positions={positions} />
        </section>
      )}

      {/* ── Decision log ───────────────────────────────────────────────── */}
      {items.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 12 }}>
            3. Log your decision (optional)
          </h2>
          <p style={{ margin: "0 0 12px", fontSize: "0.8rem", color: "#6b7280" }}>
            Record your intended action with a signed attestation anchored to 0G
            Storage. This does <strong>not</strong> execute anything — you act manually.
          </p>
          {/* Position selector */}
          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "#374151",
                marginRight: 8,
              }}
            >
              Position to log:
            </label>
            <select
              value={selectedPositionId}
              onChange={(e) => setSelectedPositionId(e.target.value)}
              style={{
                padding: "5px 8px",
                border: "1px solid #d1d5db",
                borderRadius: 5,
                fontSize: "0.875rem",
              }}
            >
              {items.map((item) => {
                const pos = positions.find((p) => p.id === item.id);
                return (
                  <option key={item.id} value={item.id}>
                    {pos ? `${pos.protocol} / ${pos.asset}` : item.id} (score{" "}
                    {item.score})
                  </option>
                );
              })}
            </select>
          </div>
          <DecisionLog positionId={selectedPositionId} apiPath="/api/yield" />
        </section>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {items.length === 0 && !isAnalysing && !analysisError && (
        <p style={{ color: "#9ca3af", fontSize: "0.875rem" }}>
          Submit your positions above to see the AI yield analysis.
        </p>
      )}
    </div>
  );
}
