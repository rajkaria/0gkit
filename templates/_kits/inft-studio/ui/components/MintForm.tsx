/**
 * inft-studio — MintForm component
 *
 * Form for minting an intelligent NFT. Accepts:
 *   - Recipient address
 *   - Token name / description
 *   - Media file (encoded as base64 before POSTing)
 *   - Optional AI model and prompt (for attested provenance)
 *   - Toggle: include attested provenance
 *
 * Calls POST /api/inft/mint and returns the MintResult on success.
 *
 * Usage:
 *   import { MintForm } from "@/components/MintForm";
 *   <MintForm onMinted={(result) => console.log(result)} />
 */

"use client";

import { useState, useRef, type FormEvent, type ChangeEvent } from "react";

// ---------------------------------------------------------------------------
// Types (mirror MintResult from lib/inft.ts — copy to avoid lib import in UI)
// ---------------------------------------------------------------------------

export interface ProvenanceBadgeData {
  model: string;
  prompt: string;
  contentHash: string;
  receipt: { model: string; prompt: string; contentHash: string; ts: number };
  attestation?: { digest: string; signature: string };
}

export interface MintResult {
  tokenId: string;
  tokenUri: string;
  contentHash: string;
  provenance?: ProvenanceBadgeData;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip data:<type>;base64, prefix
      const base64 = result.split(",")[1] ?? result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// MintForm
// ---------------------------------------------------------------------------

export interface MintFormProps {
  /** API base path. Defaults to "/api/inft". */
  apiPath?: string;
  /** Callback fired after a successful mint. */
  onMinted?: (result: MintResult) => void;
}

export function MintForm({ apiPath = "/api/inft", onMinted }: MintFormProps) {
  const [to, setTo] = useState("");
  const [tokenName, setTokenName] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [includeProvenance, setIncludeProvenance] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<MintResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Please select a media file.");
      return;
    }
    if (!to.trim()) {
      setError("Recipient address is required.");
      return;
    }

    setIsLoading(true);
    try {
      const mediaBase64 = await fileToBase64(file);
      const body = {
        to: to.trim(),
        metadata: {
          name: tokenName.trim() || "Intelligent NFT",
          description: description.trim(),
          image: "",
          mediaType: file.type,
          mediaName: file.name,
        },
        mediaBase64,
        attestProvenance: includeProvenance,
        ...(includeProvenance && model.trim() ? { model: model.trim() } : {}),
        ...(includeProvenance && prompt.trim() ? { prompt: prompt.trim() } : {}),
      };

      const res = await fetch(`${apiPath}/mint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as MintResult & { error?: string };
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }

      setSuccess(data);
      onMinted?.(data);

      // Reset form
      setTo("");
      setTokenName("");
      setDescription("");
      setModel("");
      setPrompt("");
      setIncludeProvenance(false);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Styles (inline to keep the component self-contained)
  // ─────────────────────────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "7px 10px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    fontSize: "0.875rem",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontWeight: 600,
    fontSize: "0.875rem",
    marginBottom: 4,
    color: "#374151",
  };

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        maxWidth: 520,
        padding: 24,
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        background: "#fafafa",
      }}
    >
      <h3 style={{ margin: "0 0 18px", fontSize: "1.1rem", fontWeight: 700 }}>
        Mint Intelligent NFT
      </h3>

      <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Recipient */}
        <div>
          <label style={labelStyle}>Recipient address *</label>
          <input
            type="text"
            placeholder="0x..."
            value={to}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setTo(e.target.value)}
            style={inputStyle}
            required
          />
        </div>

        {/* Name */}
        <div>
          <label style={labelStyle}>Token name</label>
          <input
            type="text"
            placeholder="My iNFT #1"
            value={tokenName}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setTokenName(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Description */}
        <div>
          <label style={labelStyle}>Description</label>
          <textarea
            placeholder="Describe this NFT…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>

        {/* Media */}
        <div>
          <label style={labelStyle}>Media file *</label>
          <input type="file" ref={fileRef} accept="image/*,video/*,audio/*" style={{ fontSize: "0.875rem" }} />
          <p style={{ margin: "4px 0 0", fontSize: "0.75rem", color: "#6b7280" }}>
            Uploaded to 0G Storage. Content hash is embedded in metadata.
          </p>
        </div>

        {/* Provenance toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            id="attestProvenance"
            checked={includeProvenance}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setIncludeProvenance(e.target.checked)}
          />
          <label htmlFor="attestProvenance" style={{ fontSize: "0.875rem", color: "#374151", cursor: "pointer" }}>
            Attest AI provenance (sign model + prompt)
          </label>
        </div>

        {includeProvenance && (
          <>
            <div>
              <label style={labelStyle}>AI model</label>
              <input
                type="text"
                placeholder="neuralmagic/Meta-Llama-3.1-70B-Instruct-FP8"
                value={model}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setModel(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Prompt</label>
              <textarea
                placeholder="The prompt used to generate this media…"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </div>
          </>
        )}

        {/* Error */}
        {error && (
          <p style={{ color: "#dc2626", fontSize: "0.875rem", margin: 0 }}>Error: {error}</p>
        )}

        {/* Success */}
        {success && (
          <div
            style={{
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: 6,
              padding: "10px 14px",
              fontSize: "0.875rem",
            }}
          >
            <strong style={{ color: "#15803d" }}>Minted!</strong>
            <p style={{ margin: "4px 0 0", wordBreak: "break-all" }}>
              Token ID: <code>{success.tokenId}</code>
            </p>
            <p style={{ margin: "4px 0 0", wordBreak: "break-all", fontSize: "0.8rem", color: "#374151" }}>
              URI: {success.tokenUri}
            </p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          style={{
            padding: "9px 18px",
            background: isLoading ? "#9ca3af" : "#6366f1",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: isLoading ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: "0.9rem",
          }}
        >
          {isLoading ? "Minting…" : "Mint iNFT"}
        </button>
      </form>
    </div>
  );
}
