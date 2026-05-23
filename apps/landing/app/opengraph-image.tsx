import { ImageResponse } from "next/og";
import { getLatestRelease } from "@/lib/version";

export const alt =
  "0Gkit — The TypeScript Toolkit for the 0G Network. npm create 0gkit-app@latest";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const release = await getLatestRelease();
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background:
          "radial-gradient(60% 50% at 50% 0%, #2a0a3e 0%, #000000 70%), #000000",
        padding: "80px",
        color: "#fefefe",
        fontFamily: "system-ui, sans-serif",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "14px",
            background: "#000000",
            border: "1.5px solid #9200e1",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#cb8aff",
            fontSize: "36px",
            fontWeight: 800,
            fontFamily: "ui-monospace, Menlo, monospace",
            letterSpacing: "-0.05em",
          }}
        >
          Ø
        </div>
        <div style={{ fontSize: "44px", fontWeight: 800, letterSpacing: "-0.02em" }}>
          0Gkit
        </div>
        <div
          style={{
            marginLeft: "auto",
            fontSize: "22px",
            color: "#b8b8c2",
            display: "flex",
            alignItems: "center",
          }}
        >
          0gkit.com
        </div>
      </div>

      <div
        style={{
          marginTop: "80px",
          fontSize: "92px",
          fontWeight: 800,
          lineHeight: 1.02,
          letterSpacing: "-0.035em",
          maxWidth: "1040px",
          display: "flex",
          flexWrap: "wrap",
          gap: "0 18px",
        }}
      >
        <span>Build on</span>
        <span
          style={{
            background:
              "linear-gradient(135deg, #cb8aff 0%, #9200e1 50%, #b75fff 100%)",
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
          marginTop: "40px",
          fontSize: "30px",
          color: "#b8b8c2",
          maxWidth: "1000px",
          lineHeight: 1.35,
        }}
      >
        {`The neutral TypeScript toolkit for storage, compute, DA, attestation, and chain. 18 packages. v${release.version} stable.`}
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
            background: "#0a0a0c",
            border: "1px solid #9200e1",
            borderRadius: "14px",
            padding: "20px 28px",
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: "28px",
            color: "#cb8aff",
            display: "flex",
            alignItems: "center",
            gap: "14px",
            boxShadow: "0 0 50px rgba(146, 0, 225, 0.45)",
          }}
        >
          <span style={{ color: "#6e6e7a" }}>$</span>
          npm create 0gkit-app@latest
        </div>
      </div>
    </div>,
    { ...size }
  );
}
