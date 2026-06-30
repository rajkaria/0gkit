/**
 * prediction-market — CreateMarketForm component
 *
 * Form for opening a new prediction market. Accepts a question string and a
 * closing date/time. Calls onSubmit with (question, closesAt) where closesAt
 * is a Unix millisecond timestamp.
 *
 * Usage (typically rendered inside MarketBoard):
 *   <CreateMarketForm onSubmit={async (question, closesAt) => { ... }} />
 */

"use client";

import { useState, type FormEvent } from "react";

export interface CreateMarketFormProps {
  onSubmit: (question: string, closesAt: number) => Promise<void>;
}

export function CreateMarketForm({ onSubmit }: CreateMarketFormProps) {
  const [question, setQuestion] = useState("");
  // Default closes-at: 7 days from now
  const defaultClosesAt = new Date(Date.now() + 7 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 16); // "YYYY-MM-DDTHH:MM"
  const [closesAtInput, setClosesAtInput] = useState(defaultClosesAt);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!question.trim()) {
      setError("Question is required.");
      return;
    }
    const closesAtMs = new Date(closesAtInput).getTime();
    if (Number.isNaN(closesAtMs)) {
      setError("Invalid closing date.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(question.trim(), closesAtMs);
      setQuestion("");
      setClosesAtInput(
        new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 16)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #bfdbfe",
        borderRadius: 10,
        padding: 20,
      }}
    >
      <h3 style={{ margin: "0 0 14px", fontSize: "1rem", fontWeight: 700, color: "#1d4ed8" }}>
        Open a New Prediction Market
      </h3>
      <form
        onSubmit={(e) => void handleSubmit(e)}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        <div>
          <label
            htmlFor="pm-question"
            style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#374151" }}
          >
            Question
          </label>
          <input
            id="pm-question"
            type="text"
            placeholder="e.g. Will ETH hit $5k by end of year?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 10px",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: "0.875rem",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div>
          <label
            htmlFor="pm-closes-at"
            style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, color: "#374151" }}
          >
            Closes at
          </label>
          <input
            id="pm-closes-at"
            type="datetime-local"
            value={closesAtInput}
            onChange={(e) => setClosesAtInput(e.target.value)}
            style={{
              padding: "8px 10px",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: "0.875rem",
            }}
          />
        </div>

        {error && (
          <p style={{ margin: 0, color: "#dc2626", fontSize: "0.8rem" }}>{error}</p>
        )}

        <div>
          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: "8px 20px",
              background: submitting ? "#93c5fd" : "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: submitting ? "not-allowed" : "pointer",
              fontSize: "0.875rem",
              fontWeight: 600,
            }}
          >
            {submitting ? "Creating…" : "Open Market"}
          </button>
        </div>
      </form>
    </div>
  );
}
