import { ImageResponse } from "next/og";

export const alt =
  "0gkit — The TypeScript Toolkit for the 0G Network. npm create 0gkit-app@latest";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background:
          "radial-gradient(60% 50% at 50% 0%, #0e2530 0%, #050507 70%), #050507",
        padding: "80px",
        color: "#e8e8ee",
        fontFamily: "system-ui, sans-serif",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
        }}
      >
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "14px",
            background: "linear-gradient(135deg, #06b6d4 0%, #8b5cf6 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#050507",
            fontSize: "26px",
            fontWeight: 800,
            fontFamily: "ui-monospace, Menlo, monospace",
            letterSpacing: "-0.05em",
          }}
        >
          0g
        </div>
        <div style={{ fontSize: "40px", fontWeight: 700, letterSpacing: "-0.02em" }}>
          0gkit
        </div>
        <div
          style={{
            marginLeft: "auto",
            fontSize: "20px",
            color: "#9ca0ad",
            display: "flex",
            alignItems: "center",
          }}
        >
          0gkit.com
        </div>
      </div>

      <div
        style={{
          marginTop: "70px",
          fontSize: "82px",
          fontWeight: 800,
          lineHeight: 1.04,
          letterSpacing: "-0.03em",
          maxWidth: "1000px",
          display: "flex",
          flexWrap: "wrap",
          gap: "0 16px",
        }}
      >
        <span>Build on</span>
        <span
          style={{
            background: "linear-gradient(135deg, #22d3ee 0%, #8b5cf6 100%)",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          0G
        </span>
        <span>in 60 seconds.</span>
      </div>

      <div
        style={{
          marginTop: "36px",
          fontSize: "28px",
          color: "#b3b8c5",
          maxWidth: "950px",
          lineHeight: 1.35,
        }}
      >
        The neutral TypeScript toolkit for storage, compute, DA, attestation, and chain.
        18 packages. v1.0.0 stable.
      </div>

      <div
        style={{
          marginTop: "auto",
          display: "flex",
          alignItems: "center",
          gap: "24px",
        }}
      >
        <div
          style={{
            background: "#0c0d12",
            border: "1px solid #22d3ee",
            borderRadius: "12px",
            padding: "18px 26px",
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: "26px",
            color: "#22d3ee",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            boxShadow: "0 0 32px rgba(34, 211, 238, 0.25)",
          }}
        >
          <span style={{ color: "#6b7187" }}>$</span>
          npm create 0gkit-app@latest
        </div>
      </div>
    </div>,
    { ...size }
  );
}
