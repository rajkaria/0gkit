/**
 * inft-studio — ProvenanceBadge component
 *
 * Displays the attested provenance record for a minted iNFT.
 * Shows the REAL attestation verification result — never a placeholder.
 *
 * Verification is performed via POST /api/inft/verify (requires the adapter
 * to expose a verify endpoint) or driven purely from the attestation fields.
 *
 * Badge states:
 *   ✓ signature verified   — digest matches and expected operator signed it
 *   ⚠ unverified           — no attestation present or verification failed
 *   ○ verifying…           — in-flight verification request
 *
 * HONESTY: This badge reflects the REAL result from attestor.verify().
 * It is a SIGNED RECEIPT badge — NOT a TEE-quote / enclave verification badge.
 * The text "✓ signature verified" means the operator key signed the provenance
 * receipt and the digest is intact. It does NOT mean a TEE was involved.
 *
 * Usage:
 *   import { ProvenanceBadge } from "@/components/ProvenanceBadge";
 *   <ProvenanceBadge provenance={mintResult.provenance} />
 */

"use client";

import { useState, useEffect } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProvenanceData {
  model: string;
  prompt: string;
  contentHash: string;
  receipt: { model: string; prompt: string; contentHash: string; ts: number };
  attestation?: { digest: string; signature: string };
}

export interface VerifyResult {
  ok: boolean;
  signer: string;
}

export interface ProvenanceBadgeProps {
  provenance?: ProvenanceData;
  /** Optional: pre-resolved verify result (skips the API call). */
  verifyResult?: VerifyResult;
  /** Optional: expected signer address for the verify call. */
  expectedSigner?: string;
  /** API path for verify. Defaults to "/api/inft/verify". */
  verifyApiPath?: string;
}

// ---------------------------------------------------------------------------
// Badge states
// ---------------------------------------------------------------------------

type BadgeState =
  | { status: "idle" }
  | { status: "verifying" }
  | { status: "verified"; ok: boolean; signer: string }
  | { status: "no-attestation" };

// ---------------------------------------------------------------------------
// ProvenanceBadge
// ---------------------------------------------------------------------------

export function ProvenanceBadge({
  provenance,
  verifyResult,
  expectedSigner,
  verifyApiPath = "/api/inft/verify",
}: ProvenanceBadgeProps) {
  const [badge, setBadge] = useState<BadgeState>({ status: "idle" });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!provenance) {
      setBadge({ status: "no-attestation" });
      return;
    }

    if (!provenance.attestation) {
      setBadge({ status: "no-attestation" });
      return;
    }

    // If a pre-resolved result was provided, use it directly
    if (verifyResult !== undefined) {
      setBadge({
        status: "verified",
        ok: verifyResult.ok,
        signer: verifyResult.signer,
      });
      return;
    }

    // Otherwise call the verify API
    setBadge({ status: "verifying" });

    const payload = {
      receipt: provenance.receipt,
      attestation: provenance.attestation,
      expectedSigner: expectedSigner,
    };

    fetch(verifyApiPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json())
      .then((data: VerifyResult & { error?: string }) => {
        if (data.error) {
          setBadge({ status: "verified", ok: false, signer: "" });
        } else {
          setBadge({ status: "verified", ok: data.ok, signer: data.signer });
        }
      })
      .catch(() => {
        setBadge({ status: "verified", ok: false, signer: "" });
      });
  }, [provenance, verifyResult, expectedSigner, verifyApiPath]);

  // ─────────────────────────────────────────────────────────────────────────
  // Badge appearance
  // ─────────────────────────────────────────────────────────────────────────

  function renderBadgePill() {
    if (badge.status === "no-attestation") {
      return (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 10px",
            borderRadius: 999,
            fontSize: "0.75rem",
            fontWeight: 600,
            background: "#f3f4f6",
            color: "#6b7280",
            border: "1px solid #d1d5db",
          }}
        >
          ○ no provenance
        </span>
      );
    }

    if (badge.status === "verifying" || badge.status === "idle") {
      return (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 10px",
            borderRadius: 999,
            fontSize: "0.75rem",
            fontWeight: 600,
            background: "#eff6ff",
            color: "#2563eb",
            border: "1px solid #bfdbfe",
          }}
        >
          ○ verifying…
        </span>
      );
    }

    // verified
    const ok = badge.ok;
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 10px",
          borderRadius: 999,
          fontSize: "0.75rem",
          fontWeight: 600,
          background: ok ? "#f0fdf4" : "#fef2f2",
          color: ok ? "#15803d" : "#dc2626",
          border: `1px solid ${ok ? "#bbf7d0" : "#fecaca"}`,
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={() => setExpanded((v) => !v)}
        title={ok ? "Click to see details" : "Verification failed — click for details"}
      >
        {ok ? "✓ signature verified" : "⚠ unverified"}
      </span>
    );
  }

  if (!provenance) return null;

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: "0.875rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, color: "#374151" }}>AI Provenance</span>
        {renderBadgePill()}
      </div>

      {/* Provenance details (always shown) */}
      <div
        style={{
          marginTop: 8,
          padding: "8px 12px",
          background: "#f9fafb",
          borderRadius: 6,
          border: "1px solid #e5e7eb",
          fontSize: "0.8rem",
          color: "#374151",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div>
          <span style={{ color: "#6b7280", fontWeight: 500 }}>Model: </span>
          {provenance.model}
        </div>
        {provenance.prompt && (
          <div>
            <span style={{ color: "#6b7280", fontWeight: 500 }}>Prompt: </span>
            <span style={{ fontStyle: "italic" }}>{provenance.prompt}</span>
          </div>
        )}
        <div style={{ wordBreak: "break-all" }}>
          <span style={{ color: "#6b7280", fontWeight: 500 }}>Content hash: </span>
          <code style={{ fontSize: "0.75rem" }}>{provenance.contentHash}</code>
        </div>
        {provenance.receipt?.ts && (
          <div>
            <span style={{ color: "#6b7280", fontWeight: 500 }}>Signed at: </span>
            {new Date(provenance.receipt.ts).toLocaleString()}
          </div>
        )}
      </div>

      {/* Expanded attestation details */}
      {expanded && badge.status === "verified" && (
        <div
          style={{
            marginTop: 6,
            padding: "8px 12px",
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 6,
            fontSize: "0.75rem",
            color: "#374151",
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          <div style={{ fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>
            Attestation details
            <span
              style={{
                marginLeft: 8,
                fontWeight: 400,
                cursor: "pointer",
                color: "#2563eb",
              }}
              onClick={() => setExpanded(false)}
            >
              [close]
            </span>
          </div>
          <p style={{ margin: 0, color: "#6b7280", fontStyle: "italic" }}>
            This is a signed receipt — the operator key signed the provenance digest via
            EIP-191 personal-sign. It is NOT a TEE-quote / enclave attestation.
          </p>
          {provenance.attestation && (
            <>
              <div style={{ wordBreak: "break-all" }}>
                <strong>Digest: </strong>
                <code>{provenance.attestation.digest}</code>
              </div>
              <div style={{ wordBreak: "break-all" }}>
                <strong>Signature: </strong>
                <code>{provenance.attestation.signature.slice(0, 20)}…</code>
              </div>
            </>
          )}
          {badge.ok && (
            <div style={{ wordBreak: "break-all" }}>
              <strong>Recovered signer: </strong>
              <code>{badge.signer}</code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
