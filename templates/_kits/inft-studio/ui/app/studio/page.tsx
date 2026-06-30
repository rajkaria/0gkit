/**
 * inft-studio — Studio page
 *
 * Top-level page that combines the MintForm and Gallery into a full iNFT
 * studio UI. Inject this page at app/studio/page.tsx in the base template.
 *
 * Usage:
 *   This file is overlaid onto the base by the kits engine.
 *   Access it at /studio in the running app.
 */

"use client";

import { useState } from "react";
import { MintForm, type MintResult } from "../../components/MintForm.js";
import { Gallery } from "../../components/Gallery.js";

export default function StudioPage() {
  const [lastMint, setLastMint] = useState<MintResult | null>(null);
  const [galleryOwner, setGalleryOwner] = useState("");
  const [activeTab, setActiveTab] = useState<"mint" | "gallery">("mint");

  function handleMinted(result: MintResult) {
    setLastMint(result);
    // Auto-switch to gallery after mint (user can inspect their new token)
  }

  const tabStyle = (tab: "mint" | "gallery"): React.CSSProperties => ({
    padding: "8px 22px",
    border: "none",
    borderBottom: activeTab === tab ? "2px solid #6366f1" : "2px solid transparent",
    background: "transparent",
    cursor: "pointer",
    fontWeight: activeTab === tab ? 700 : 500,
    color: activeTab === tab ? "#6366f1" : "#6b7280",
    fontSize: "0.9375rem",
  });

  return (
    <main
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        maxWidth: 960,
        margin: "0 auto",
        padding: "32px 20px",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: "0 0 6px", fontSize: "1.75rem", fontWeight: 800, color: "#111827" }}>
          iNFT Studio
        </h1>
        <p style={{ margin: 0, color: "#6b7280", fontSize: "0.9375rem" }}>
          Mint intelligent NFTs with AI-generated media and attested provenance on 0G Storage.
        </p>
      </div>

      {/* Last mint banner */}
      {lastMint && (
        <div
          style={{
            marginBottom: 24,
            padding: "12px 16px",
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: 8,
            fontSize: "0.875rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <span>
            <strong style={{ color: "#15803d" }}>Minted!</strong>{" "}
            Token #{lastMint.tokenId} — {lastMint.tokenUri}
          </span>
          <button
            onClick={() => {
              setGalleryOwner("");
              setActiveTab("gallery");
            }}
            style={{
              padding: "4px 12px",
              background: "#16a34a",
              color: "#fff",
              border: "none",
              borderRadius: 5,
              cursor: "pointer",
              fontSize: "0.8rem",
              fontWeight: 600,
            }}
          >
            View Gallery →
          </button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ borderBottom: "1px solid #e5e7eb", marginBottom: 24 }}>
        <button style={tabStyle("mint")} onClick={() => setActiveTab("mint")}>
          Mint
        </button>
        <button style={tabStyle("gallery")} onClick={() => setActiveTab("gallery")}>
          Gallery
        </button>
      </div>

      {/* Content */}
      {activeTab === "mint" && (
        <MintForm onMinted={handleMinted} />
      )}

      {activeTab === "gallery" && (
        <div>
          {/* Owner input */}
          <div style={{ marginBottom: 20 }}>
            <label
              style={{ display: "block", fontWeight: 600, fontSize: "0.875rem", marginBottom: 6, color: "#374151" }}
            >
              View tokens for address
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                placeholder="0x…"
                value={galleryOwner}
                onChange={(e) => setGalleryOwner(e.target.value)}
                style={{
                  flex: 1,
                  maxWidth: 420,
                  padding: "7px 10px",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  fontSize: "0.875rem",
                }}
              />
            </div>
          </div>
          <Gallery ownerAddress={galleryOwner} />
        </div>
      )}
    </main>
  );
}
