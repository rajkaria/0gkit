/**
 * yield-intel — YieldTable component
 *
 * Displays the AI-ranked yield analysis results.
 * Read-only — shows analysis + rationale. No execution buttons.
 *
 * Usage:
 *   import { YieldTable } from "@/components/YieldTable";
 *   <YieldTable items={analysisItems} positions={positions} />
 */

"use client";

export interface AnalysisItem {
  id: string;
  score: number;
  rationale: string;
}

export interface Position {
  id: string;
  protocol: string;
  asset: string;
  amount: number;
  apy: number;
}

export interface YieldTableProps {
  /** Ranked analysis items from the AI (sorted by descending score). */
  items: AnalysisItem[];
  /** Original positions for label lookup. */
  positions: Position[];
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 75 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626";
  const bg =
    score >= 75 ? "#dcfce7" : score >= 50 ? "#fef3c7" : "#fee2e2";
  const border =
    score >= 75 ? "#86efac" : score >= 50 ? "#fcd34d" : "#fca5a5";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 12,
        fontSize: "0.75rem",
        fontWeight: 700,
        background: bg,
        color,
        border: `1px solid ${border}`,
        minWidth: 44,
        justifyContent: "center",
      }}
    >
      {score}
    </span>
  );
}

export function YieldTable({ items, positions }: YieldTableProps) {
  const posMap = new Map(positions.map((p) => [p.id, p]));

  if (items.length === 0) {
    return (
      <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
        No analysis items to display.
      </p>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "0.875rem",
        }}
      >
        <thead>
          <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
            <th style={thStyle}>Rank</th>
            <th style={thStyle}>Score</th>
            <th style={thStyle}>Protocol</th>
            <th style={thStyle}>Asset</th>
            <th style={{ ...thStyle, textAlign: "right" }}>APY</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
            <th style={{ ...thStyle, width: "40%" }}>AI Rationale</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const pos = posMap.get(item.id);
            return (
              <tr
                key={item.id}
                style={{
                  borderBottom: "1px solid #f3f4f6",
                  background: idx % 2 === 0 ? "#ffffff" : "#f9fafb",
                }}
              >
                <td style={{ ...tdStyle, color: "#6b7280" }}>#{idx + 1}</td>
                <td style={tdStyle}>
                  <ScoreBadge score={item.score} />
                </td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>
                  {pos?.protocol ?? item.id}
                </td>
                <td style={tdStyle}>{pos?.asset ?? "—"}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>
                  {pos ? `${pos.apy.toFixed(2)}%` : "—"}
                </td>
                <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>
                  {pos ? pos.amount.toLocaleString() : "—"}
                </td>
                <td
                  style={{
                    ...tdStyle,
                    color: "#374151",
                    lineHeight: 1.5,
                    fontStyle: "italic",
                  }}
                >
                  {item.rationale}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p
        style={{
          marginTop: 8,
          fontSize: "0.7rem",
          color: "#9ca3af",
        }}
      >
        AI analysis only — scores reflect relative analysis, not investment recommendations.
        You decide whether to act. This system does not execute transactions.
      </p>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "8px 12px",
  textAlign: "left",
  fontWeight: 600,
  color: "#374151",
  fontSize: "0.8rem",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  verticalAlign: "top",
};
