import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { KitsShowcase } from "@/components/KitsShowcase";
import { CTABottom } from "@/components/CTABottom";

export const metadata: Metadata = {
  title: "Kits — Drop-in feature kits for 0G apps",
  description:
    "0gkit Kits are composable, multi-framework feature overlays you add to any 0gkit app. Upgradeable, typed, CI-gated. 8 kits across Verifiable AI, Agent Infrastructure, Markets, Assets, and DeFi.",
  alternates: { canonical: "/kits" },
};

export default function KitsPage() {
  return (
    <>
      <Nav />
      <main>
        {/* ── Hero ──────────────────────────────────────────────────── */}
        <section
          style={{
            paddingTop: "4.5rem",
            paddingBottom: "4rem",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(60% 50% at 50% 0%, color-mix(in srgb, var(--color-accent) 18%, transparent), transparent 70%)",
              pointerEvents: "none",
            }}
          />
          <div className="container-x" style={{ position: "relative", zIndex: 1 }}>
            <div
              className="pill pill-accent rise rise-d-1"
              style={{ marginBottom: "1.8rem", display: "inline-flex" }}
            >
              <span className="pill-dot" />
              0gkit Kits · 8 kits · author your own
            </div>

            <h1
              className="rise rise-d-2"
              style={{
                margin: "0 auto",
                fontSize: "clamp(2.4rem, 7vw, 4.8rem)",
                lineHeight: 1.04,
                letterSpacing: "-0.038em",
                fontWeight: 800,
                maxWidth: "24ch",
              }}
            >
              Drop-in feature kits for{" "}
              <span className="text-gradient">any 0G app.</span>
            </h1>

            <p
              className="rise rise-d-3"
              style={{
                margin: "1.6rem auto 0",
                maxWidth: "660px",
                fontSize: "clamp(1rem, 1.85vw, 1.18rem)",
                color: "var(--color-fg-dim)",
                lineHeight: 1.55,
              }}
            >
              One command adds a working, <strong>typed</strong>,{" "}
              <strong>upgradeable</strong> feature to your project — wired to your
              installed{" "}
              <code
                style={{ color: "var(--color-accent-2)", background: "transparent" }}
              >
                @foundryprotocol/0gkit-*
              </code>{" "}
              packages. Kits are <strong>multi-framework</strong>: one kit, every base.
            </p>

            {/* primary CTA */}
            <div
              className="rise rise-d-4"
              style={{
                marginTop: "2.2rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.75rem",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  background: "var(--color-code-bg)",
                  border: "1px solid var(--color-border-strong)",
                  borderRadius: "12px",
                  padding: "0.85rem 1rem 0.85rem 1.2rem",
                  fontFamily: "var(--font-mono)",
                  fontSize: "1.05rem",
                  boxShadow:
                    "0 0 0 1px color-mix(in srgb, var(--color-brand) 30%, transparent), 0 20px 60px -20px color-mix(in srgb, var(--color-brand) 70%, transparent)",
                }}
              >
                <span style={{ color: "var(--color-fg-muted)" }} aria-hidden>
                  $
                </span>
                <code style={{ color: "var(--color-fg)", background: "transparent" }}>
                  0g add &lt;kit&gt;
                </code>
              </div>
            </div>

            <div
              className="rise rise-d-5"
              style={{
                marginTop: "1.2rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.6rem",
                flexWrap: "wrap",
              }}
            >
              <a href="#kits" className="btn btn-primary">
                Browse kits
                <Arrow />
              </a>
              <a href="https://docs.0gkit.com/kits/authoring" className="btn btn-ghost">
                Publish your own kit
              </a>
              <a
                href="https://docs.0gkit.com/packages/0gkit-kits"
                className="btn btn-ghost"
              >
                Read the docs
              </a>
            </div>

            <p
              className="rise rise-d-5"
              style={{
                marginTop: "1.6rem",
                fontSize: "0.82rem",
                color: "var(--color-fg-muted)",
              }}
            >
              Upgradeable · Typed · Multi-framework · CI-gated per kit×base combo
            </p>
          </div>
        </section>

        <KitsShowcase />
        <CTABottom />
      </main>
      <Footer />
    </>
  );
}

function Arrow() {
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
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}
