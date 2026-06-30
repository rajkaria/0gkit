/**
 * inft-studio — Gallery component
 *
 * Displays a grid of minted iNFT tokens for an owner address.
 * Fetches token list via GET /api/inft/tokens?owner=<address>&limit=<n>
 * and token details via GET /api/inft/token?id=<tokenId>.
 *
 * ProvenanceBadge is shown inline for tokens that carry provenance data.
 *
 * Usage:
 *   import { Gallery } from "@/components/Gallery";
 *   <Gallery ownerAddress="0x..." />
 */

"use client";

import { useState, useEffect, type ChangeEvent } from "react";
import { ProvenanceBadge } from "./ProvenanceBadge.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenItem {
  tokenId: string;
  owner: string;
  tokenURI: string;
  provenance?: {
    model: string;
    prompt: string;
    contentHash: string;
    receipt: { model: string; prompt: string; contentHash: string; ts: number };
    attestation?: { digest: string; signature: string };
  };
}

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------

export interface GalleryProps {
  /** Default owner address to display. User can override in the input. */
  ownerAddress?: string;
  /** API base path. Defaults to "/api/inft". */
  apiPath?: string;
  /** Max tokens to display. Defaults to 20. */
  limit?: number;
}

export function Gallery({
  ownerAddress = "",
  apiPath = "/api/inft",
  limit = 20,
}: GalleryProps) {
  const [address, setAddress] = useState(ownerAddress);
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchTokens(addr: string) {
    if (!addr.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiPath}/tokens?owner=${encodeURIComponent(addr)}&limit=${limit}`);
      const data = (await res.json()) as { tokens?: TokenItem[]; error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? `HTTP ${res.status}`);
        setTokens([]);
        return;
      }
      setTokens(data.tokens ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setTokens([]);
    } finally {
      setIsLoading(false);
    }
  }

  // Fetch on mount if ownerAddress is provided
  useEffect(() => {
    if (ownerAddress) {
      void fetchTokens(ownerAddress);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerAddress]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    void fetchTokens(address);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", maxWidth: 900 }}>
      <h3 style={{ margin: "0 0 16px", fontSize: "1.1rem", fontWeight: 700 }}>
        iNFT Gallery
      </h3>

      {/* Address input */}
      <form
        onSubmit={handleSearch}
        style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}
      >
        <input
          type="text"
          placeholder="Owner address (0x…)"
          value={address}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setAddress(e.target.value)}
          style={{
            flex: 1,
            minWidth: 240,
            padding: "7px 10px",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            fontSize: "0.875rem",
          }}
        />
        <button
          type="submit"
          disabled={isLoading}
          style={{
            padding: "7px 16px",
            background: "#6366f1",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: isLoading ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: "0.875rem",
            opacity: isLoading ? 0.7 : 1,
          }}
        >
          {isLoading ? "Loading…" : "View Gallery"}
        </button>
      </form>

      {error && (
        <p style={{ color: "#dc2626", fontSize: "0.875rem", marginBottom: 12 }}>
          Error: {error}
        </p>
      )}

      {!isLoading && tokens.length === 0 && !error && address && (
        <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>No tokens found.</p>
      )}

      {/* Token grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        {tokens.map((token) => (
          <TokenCard key={token.tokenId} token={token} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TokenCard
// ---------------------------------------------------------------------------

function TokenCard({ token }: { token: TokenItem }) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: 16,
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <span
            style={{
              display: "inline-block",
              padding: "2px 8px",
              background: "#ede9fe",
              color: "#6d28d9",
              borderRadius: 999,
              fontSize: "0.75rem",
              fontWeight: 700,
            }}
          >
            #{token.tokenId}
          </span>
        </div>
      </div>

      {/* Token URI */}
      <div style={{ fontSize: "0.8rem" }}>
        <span style={{ color: "#6b7280", fontWeight: 500 }}>URI: </span>
        <span
          style={{ wordBreak: "break-all", color: "#374151" }}
          title={token.tokenURI}
        >
          {token.tokenURI.length > 50
            ? token.tokenURI.slice(0, 47) + "…"
            : token.tokenURI}
        </span>
      </div>

      {/* Owner */}
      <div style={{ fontSize: "0.8rem" }}>
        <span style={{ color: "#6b7280", fontWeight: 500 }}>Owner: </span>
        <code style={{ fontSize: "0.75rem" }}>
          {token.owner.slice(0, 6)}…{token.owner.slice(-4)}
        </code>
      </div>

      {/* Provenance badge */}
      {token.provenance && (
        <ProvenanceBadge provenance={token.provenance} />
      )}
    </div>
  );
}
