"use client";

import { useCallback, useState } from "react";

type InstallCommandProps = {
  command?: string;
  size?: "lg" | "md";
};

export function InstallCommand({
  command = "npm create 0gkit-app@latest",
  size = "lg",
}: InstallCommandProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // No-op — clipboard blocked in some embedded contexts.
    }
  }, [command]);

  const isLg = size === "lg";

  return (
    <div
      role="group"
      aria-label="Install command"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: isLg ? "0.8rem" : "0.5rem",
        background: "var(--color-code-bg)",
        border: "1px solid var(--color-border-strong)",
        borderRadius: "12px",
        padding: isLg ? "0.85rem 1rem 0.85rem 1.2rem" : "0.55rem 0.7rem 0.55rem 0.9rem",
        fontFamily: "var(--font-mono)",
        fontSize: isLg ? "1.05rem" : "0.85rem",
        boxShadow: isLg
          ? "0 0 0 1px color-mix(in srgb, var(--color-accent) 25%, transparent), 0 20px 40px -20px color-mix(in srgb, var(--color-accent) 40%, transparent)"
          : "none",
        maxWidth: "100%",
      }}
    >
      <span aria-hidden style={{ color: "var(--color-fg-muted)" }}>
        $
      </span>
      <code
        style={{
          color: "var(--color-fg)",
          background: "transparent",
          padding: 0,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          flex: 1,
        }}
      >
        {command}
      </code>
      <button
        type="button"
        onClick={onCopy}
        aria-label={copied ? "Copied" : "Copy install command"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.35rem",
          padding: "0.35rem 0.7rem",
          borderRadius: "8px",
          border: "1px solid var(--color-border-strong)",
          background: "transparent",
          color: copied ? "var(--color-success)" : "var(--color-fg-dim)",
          fontSize: "0.78rem",
          fontFamily: "var(--font-sans)",
          fontWeight: 600,
          cursor: "pointer",
          transition: "all 150ms ease",
        }}
        onMouseEnter={(e) => {
          if (!copied) e.currentTarget.style.borderColor = "var(--color-accent)";
        }}
        onMouseLeave={(e) => {
          if (!copied) e.currentTarget.style.borderColor = "var(--color-border-strong)";
        }}
      >
        {copied ? (
          <>
            <CheckIcon />
            <span>Copied</span>
          </>
        ) : (
          <>
            <CopyIcon />
            <span>Copy</span>
          </>
        )}
      </button>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
