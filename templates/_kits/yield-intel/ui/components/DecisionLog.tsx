/**
 * yield-intel — DecisionLog component
 *
 * Form to log a user's intended action with an attested receipt stored on
 * 0G Storage. Displays the signed attestation details after logging.
 *
 * HONESTY INVARIANT:
 *   - The button submits a LOG request — not an execution.
 *   - Label is "Log Decision" (never "Execute" / "Trade" / "Swap").
 *   - Copy explicitly states: "This logs your decision — it does NOT execute it."
 *
 * Usage:
 *   import { DecisionLog } from "@/components/DecisionLog";
 *   <DecisionLog positionId="pos-1" apiPath="/api/yield" />
 */

"use client";

import { useState, type FormEvent } from "react";

export interface DecisionLogProps {
  /** Pre-populate with the position ID from the analysis. */
  positionId?: string;
  /** API route base path. Defaults to "/api/yield". */
  apiPath?: string;
}

interface LoggedRecord {
  id: string;
  storageRef: string;
  ts: number;
  attestation: { digest: string; signature: string };
}

export function DecisionLog({
  positionId = "",
  apiPath = "/api/yield",
}: DecisionLogProps) {
  const [pid, setPid] = useState(positionId);
  const [action, setAction] = useState("");
  const [rationale, setRationale] = useState("");
  const [score, setScore] = useState<number>(50);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<LoggedRecord | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!action.trim()) return;

    setIsLoading(true);
    setError(null);
    setRecord(null);

    try {
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "log",
          decision: {
            positionId: pid.trim(),
            action: action.trim(),
            rationale: rationale.trim(),
            score,
          },
        }),
      });
      const data = (await res.json()) as { record?: LoggedRecord; error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? "Unknown error");
      } else if (data.record) {
        setRecord(data.record);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 20,
        background: "#f9fafb",
      }}
    >
      <h3 style={{ margin: "0 0 4px", fontSize: "1rem", fontWeight: 700 }}>
        Log a Decision
      </h3>
      <p style={{ margin: "0 0 16px", fontSize: "0.8rem", color: "#6b7280" }}>
        Record your intended action with an attested receipt on 0G Storage.
        <strong style={{ color: "#374151" }}>
          {" "}
          This logs your decision — it does NOT execute it.
        </strong>
      </p>

      <form onSubmit={(e) => void handleSubmit(e)}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Position ID</label>
          <input
            type="text"
            value={pid}
            onChange={(e) => setPid(e.target.value)}
            placeholder="pos-1"
            style={inputStyle}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Intended action (you execute this manually)</label>
          <input
            type="text"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="e.g. Rebalance into Aave USDC — higher yield"
            required
            style={inputStyle}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Rationale</label>
          <input
            type="text"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="e.g. AI ranked it #1 — stable stablecoin, low risk"
            style={inputStyle}
          />
        </div>

        <div style={{ ...fieldStyle, marginBottom: 16 }}>
          <label style={labelStyle}>Score ({score})</label>
          <input
            type="range"
            min={0}
            max={100}
            value={score}
            onChange={(e) => setScore(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || !action.trim()}
          style={{
            padding: "8px 18px",
            background: isLoading || !action.trim() ? "#93c5fd" : "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: isLoading || !action.trim() ? "not-allowed" : "pointer",
            fontSize: "0.875rem",
            fontWeight: 600,
          }}
        >
          {isLoading ? "Logging…" : "Log Decision"}
        </button>
      </form>

      {error && (
        <p style={{ marginTop: 12, color: "#dc2626", fontSize: "0.875rem" }}>
          Error: {error}
        </p>
      )}

      {record && (
        <div
          style={{
            marginTop: 16,
            border: "1px solid #86efac",
            borderRadius: 6,
            padding: 12,
            background: "#f0fdf4",
          }}
        >
          <p
            style={{
              margin: "0 0 4px",
              fontWeight: 600,
              color: "#15803d",
              fontSize: "0.875rem",
            }}
          >
            ✓ Decision logged and attested
          </p>
          <p style={{ margin: "0 0 2px", fontSize: "0.75rem", color: "#374151" }}>
            <strong>Record ID:</strong> <code style={codeStyle}>{record.id}</code>
          </p>
          <p style={{ margin: "0 0 2px", fontSize: "0.75rem", color: "#374151" }}>
            <strong>0G Storage root:</strong>{" "}
            <code style={codeStyle}>{record.storageRef.slice(0, 18)}…</code>
          </p>
          <p style={{ margin: "0 0 2px", fontSize: "0.75rem", color: "#374151" }}>
            <strong>Attestation digest:</strong>{" "}
            <code style={codeStyle}>{record.attestation.digest.slice(0, 18)}…</code>
          </p>
          <p style={{ margin: "4px 0 0", fontSize: "0.7rem", color: "#6b7280" }}>
            Attestation = signed receipt (✓ signature verified — not TEE-quote).
            Immutable reference stored on 0G Storage (Galileo testnet).
          </p>
        </div>
      )}
    </div>
  );
}

const fieldStyle: React.CSSProperties = { marginBottom: 12 };

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 4,
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "#374151",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 5,
  fontSize: "0.875rem",
  boxSizing: "border-box",
};

const codeStyle: React.CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.75rem",
  background: "#f3f4f6",
  padding: "1px 4px",
  borderRadius: 3,
};
