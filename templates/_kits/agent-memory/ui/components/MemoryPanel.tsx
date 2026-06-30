/**
 * agent-memory — MemoryPanel React component
 *
 * Renders a full agent memory UI:
 *   - Search/recall input
 *   - List of current memory entries
 *   - Form to add a new key→value entry
 *
 * Requires the react-app adapter (GET/POST /api/memory route).
 *
 * Usage:
 *   import { MemoryPanel } from "@/components/MemoryPanel";
 *   <MemoryPanel />
 */

"use client";

import { useState, type FormEvent } from "react";
import { useAgentMemory, type MemoryEntry } from "../hooks/useAgentMemory.js";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EntryRow({ entry }: { entry: MemoryEntry }) {
  const date = new Date(entry.ts).toLocaleString();
  return (
    <tr>
      <td
        style={{
          padding: "6px 10px",
          fontWeight: 600,
          whiteSpace: "nowrap",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        {entry.key}
      </td>
      <td
        style={{
          padding: "6px 10px",
          wordBreak: "break-word",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        {entry.value}
      </td>
      <td
        style={{
          padding: "6px 10px",
          fontSize: "0.75rem",
          color: "#6b7280",
          whiteSpace: "nowrap",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        {date}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// MemoryPanel
// ---------------------------------------------------------------------------

export interface MemoryPanelProps {
  /** API route prefix. Defaults to "/api/memory". */
  apiPath?: string;
  /** Panel title. Defaults to "Agent Memory". */
  title?: string;
}

export function MemoryPanel({
  apiPath = "/api/memory",
  title = "Agent Memory",
}: MemoryPanelProps) {
  const { entries, isLoading, error, remember, recall, refresh } =
    useAgentMemory(apiPath);

  const [query, setQuery] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    void recall(query);
  }

  async function handleRemember(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!newKey.trim()) {
      setSubmitError("Key is required.");
      return;
    }
    await remember(newKey.trim(), newValue);
    setNewKey("");
    setNewValue("");
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        maxWidth: 700,
        margin: "0 auto",
        padding: 20,
      }}
    >
      <h2 style={{ marginBottom: 16, fontSize: "1.25rem", fontWeight: 700 }}>
        {title}
      </h2>

      {/* Search */}
      <form
        onSubmit={handleSearch}
        style={{ display: "flex", gap: 8, marginBottom: 20 }}
      >
        <input
          type="text"
          placeholder="Search memory…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: 1,
            padding: "6px 10px",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            fontSize: "0.875rem",
          }}
        />
        <button
          type="submit"
          style={{
            padding: "6px 14px",
            background: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: "0.875rem",
          }}
        >
          Recall
        </button>
        <button
          type="button"
          onClick={() => {
            setQuery("");
            void refresh();
          }}
          style={{
            padding: "6px 14px",
            background: "#f3f4f6",
            color: "#374151",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: "0.875rem",
          }}
        >
          All
        </button>
      </form>

      {/* Entry table */}
      {error && (
        <p style={{ color: "#dc2626", marginBottom: 12, fontSize: "0.875rem" }}>
          Error: {error}
        </p>
      )}
      {isLoading ? (
        <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>Loading…</p>
      ) : entries.length === 0 ? (
        <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
          No entries found.
        </p>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.875rem",
            marginBottom: 24,
          }}
        >
          <thead>
            <tr>
              {["Key", "Value", "Stored at"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "6px 10px",
                    borderBottom: "2px solid #e5e7eb",
                    color: "#374151",
                    fontWeight: 600,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <EntryRow key={e.key} entry={e} />
            ))}
          </tbody>
        </table>
      )}

      {/* Add entry form */}
      <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 10 }}>
        Add memory
      </h3>
      <form onSubmit={(e) => void handleRemember(e)} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            placeholder="Key"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            style={{
              flex: "0 0 180px",
              padding: "6px 10px",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: "0.875rem",
            }}
          />
          <input
            type="text"
            placeholder="Value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            style={{
              flex: 1,
              padding: "6px 10px",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: "0.875rem",
            }}
          />
          <button
            type="submit"
            disabled={isLoading}
            style={{
              padding: "6px 14px",
              background: "#16a34a",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: isLoading ? "not-allowed" : "pointer",
              fontSize: "0.875rem",
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            Remember
          </button>
        </div>
        {submitError && (
          <p style={{ color: "#dc2626", fontSize: "0.8rem", margin: 0 }}>
            {submitError}
          </p>
        )}
      </form>
    </div>
  );
}
