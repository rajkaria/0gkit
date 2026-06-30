/**
 * sealed-inference — SealedChat React component
 *
 * Renders a chat-style UI for sealed inference with a verification badge.
 *
 * Badge text is driven STRICTLY from the real `verified` value returned by the
 * API — never hardcoded, never always-green:
 *   verified=true  → "✓ signature verified"
 *   verified=false → "⚠ unverified"
 *
 * This is NOT TEE-quote verification. The badge means the expected operator key
 * signed the inference receipt and the digest matches.
 *
 * Requires the react-app or chat adapter (POST /api/sealed route).
 *
 * Usage:
 *   import { SealedChat } from "@/components/SealedChat";
 *   <SealedChat />
 */

"use client";

import { useState, type FormEvent } from "react";
import { useSealedInference } from "../hooks/useSealedInference.js";

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

/**
 * VerificationBadge — driven STRICTLY from the `verified` prop.
 * Never hardcoded. Reflects the real verify() result from the server.
 */
function VerificationBadge({ verified }: { verified: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: 12,
        fontSize: "0.75rem",
        fontWeight: 600,
        background: verified ? "#dcfce7" : "#fef9c3",
        color: verified ? "#15803d" : "#92400e",
        border: `1px solid ${verified ? "#86efac" : "#fcd34d"}`,
      }}
    >
      {verified ? "✓ signature verified" : "⚠ unverified"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SealedChat
// ---------------------------------------------------------------------------

export interface SealedChatProps {
  /** API route path. Defaults to "/api/sealed". */
  apiPath?: string;
  /** Panel title. Defaults to "Sealed Inference". */
  title?: string;
}

export function SealedChat({
  apiPath = "/api/sealed",
  title = "Sealed Inference",
}: SealedChatProps) {
  const { result, isLoading, error, run } = useSealedInference(apiPath);
  const [prompt, setPrompt] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    await run(prompt.trim());
  }

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        maxWidth: 700,
        margin: "0 auto",
        padding: 20,
      }}
    >
      <h2 style={{ marginBottom: 4, fontSize: "1.25rem", fontWeight: 700 }}>{title}</h2>
      <p style={{ marginBottom: 16, fontSize: "0.8rem", color: "#6b7280" }}>
        Each response is signed by the operator key. The badge reflects the real
        verification result — not TEE-quote verification.
      </p>

      {/* Prompt form */}
      <form
        onSubmit={(e) => void handleSubmit(e)}
        style={{ display: "flex", gap: 8, marginBottom: 20 }}
      >
        <input
          type="text"
          placeholder="Enter your prompt…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={isLoading}
          style={{
            flex: 1,
            padding: "8px 12px",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            fontSize: "0.875rem",
          }}
        />
        <button
          type="submit"
          disabled={isLoading || !prompt.trim()}
          style={{
            padding: "8px 16px",
            background: isLoading ? "#93c5fd" : "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: isLoading || !prompt.trim() ? "not-allowed" : "pointer",
            fontSize: "0.875rem",
            fontWeight: 600,
          }}
        >
          {isLoading ? "Running…" : "Run"}
        </button>
      </form>

      {/* Error */}
      {error && (
        <p style={{ color: "#dc2626", marginBottom: 12, fontSize: "0.875rem" }}>
          Error: {error}
        </p>
      )}

      {/* Result */}
      {result && (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: 16,
            background: "#f9fafb",
          }}
        >
          {/* Badge — DRIVEN BY real verified value, never hardcoded */}
          <div style={{ marginBottom: 10 }}>
            <VerificationBadge verified={result.verified} />
          </div>

          {/* Response text */}
          <p
            style={{
              margin: "0 0 12px",
              fontSize: "0.9rem",
              lineHeight: 1.6,
              color: "#111827",
              whiteSpace: "pre-wrap",
            }}
          >
            {result.text}
          </p>

          {/* Attestation details */}
          <div
            style={{
              borderTop: "1px solid #e5e7eb",
              paddingTop: 10,
              fontSize: "0.75rem",
              color: "#6b7280",
            }}
          >
            <strong>Attestation digest:</strong>{" "}
            <code style={{ fontFamily: "monospace" }}>
              {result.attestation.digest.slice(0, 26)}…
            </code>
            <br />
            <strong>Signed at:</strong> {new Date(result.receipt.ts).toLocaleString()}
          </div>
        </div>
      )}

      {/* No result yet */}
      {!result && !isLoading && !error && (
        <p style={{ color: "#9ca3af", fontSize: "0.875rem" }}>
          Submit a prompt to see the sealed inference result.
        </p>
      )}
    </div>
  );
}
