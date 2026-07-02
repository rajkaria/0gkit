import { SectionHeader } from "./ValueProps";
import { KitCard } from "./KitCard";
import { AuthorKitCTA } from "./AuthorKitCTA";
import { KITS } from "@/lib/kits";

// ---------------------------------------------------------------------------
// Why 0gkit Kits — the structural benefits every kit ships with. Pure product
// value, stated on its own terms (no competitor comparison).
// ---------------------------------------------------------------------------
type Benefit = { title: string; body: string };
const BENEFITS: Benefit[] = [
  {
    title: "Upgradeable, not a code dump",
    body: "Logic lives in versioned `0gkit-*` packages; the overlay is thin glue. `0g update` pulls fixes and improvements into a project you already scaffolded.",
  },
  {
    title: "Multi-framework by design",
    body: "One kit works across the React, Hono, MCP, and Node bases. Write the feature once — it wires itself into whichever base you scaffolded.",
  },
  {
    title: "Typed errors, surfaced in the UI",
    body: "Every kit rides the `ZeroGError` 45-code taxonomy — each error carries a `.code`, a `.hint`, and a `helpUrl` you can render straight into the kit UI.",
  },
  {
    title: "Durable where it matters",
    body: "The durable-agent kit gives you a restartable agent loop on `0gkit-jobs` — a step ledger and OTEL traces mean it survives restarts and crashes.",
  },
  {
    title: "Kits compose kits",
    body: "prediction-market composes ai-oracle; the engine resolves dependency order, dedupes shared packages, and keeps the graph cycle-safe for you.",
  },
  {
    title: "CI-gated per kit × base",
    body: "Every kit×base combination is typecheck- and build-gated in CI (`pnpm kits:check`). If a kit compiles on a base, it's because the matrix proved it.",
  },
  {
    title: "Observability out of the box",
    body: "`0gkit-observability` OpenTelemetry instrumentation is wired into durable-agent — traces, spans, and `0g.*` semantic attributes with no extra setup.",
  },
  {
    title: "Yours, under MIT",
    body: "MIT-licensed with no strings. Every primitive keeps a `.raw()` escape hatch to the underlying 0G SDK, so you are never blocked or locked in.",
  },
];

export function KitsShowcase() {
  return (
    <>
      {/* ── Kit catalog ─────────────────────────────────────────────── */}
      <section className="section" id="kits">
        <div className="container-x">
          <SectionHeader
            kicker="0gkit Kits"
            title={
              <>
                Drop-in feature kits for your{" "}
                <span className="text-gradient">0G app.</span>
              </>
            }
            sub="Add a working, typed, upgradeable feature at scaffold time or into an existing project. One command — the kit wires itself."
          />

          <div
            style={{
              marginTop: "2rem",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
              gap: "1rem",
            }}
          >
            {KITS.map((kit) => (
              <KitCard key={kit.slug} kit={kit} />
            ))}
          </div>

          {/* Install snippet */}
          <div style={{ marginTop: "2.5rem", textAlign: "center" }}>
            <p
              style={{
                marginBottom: "1rem",
                color: "var(--color-fg-dim)",
                fontSize: "0.95rem",
              }}
            >
              Add any kit at scaffold time or drop it into an existing project:
            </p>
            <div
              style={{
                display: "inline-flex",
                flexDirection: "column",
                gap: "0.5rem",
                alignItems: "flex-start",
              }}
            >
              {[
                "npm create 0gkit-app@latest my-app -- --kits agent-memory,prediction-market",
                "0g add prediction-market",
              ].map((cmd) => (
                <div
                  key={cmd}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    background: "var(--color-code-bg)",
                    border: "1px solid var(--color-border-strong)",
                    borderRadius: "10px",
                    padding: "0.6rem 1rem",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.88rem",
                    maxWidth: "100%",
                    overflowX: "auto",
                  }}
                >
                  <span style={{ color: "var(--color-fg-muted)" }} aria-hidden>
                    $
                  </span>
                  <code style={{ color: "var(--color-fg)", background: "transparent" }}>
                    {cmd}
                  </code>
                </div>
              ))}
            </div>
          </div>

          {/* Author-your-own-kit funnel — the community "skills repo" hook */}
          <AuthorKitCTA />
        </div>
      </section>

      {/* ── Why kits ─────────────────────────────────────────────────── */}
      <section
        className="section"
        style={{ background: "var(--color-bg-elev)" }}
        id="why-kits"
      >
        <div className="container-x">
          <SectionHeader
            kicker="Why 0gkit Kits"
            title={
              <>
                Built to last,{" "}
                <span className="text-gradient">not just to scaffold.</span>
              </>
            }
            sub="Every kit is upgradeable, typed, multi-framework, and CI-gated from day one — the structural foundations you'd otherwise have to build and maintain yourself."
          />

          <div
            style={{
              marginTop: "2.5rem",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1rem",
            }}
          >
            {BENEFITS.map((b) => (
              <div
                key={b.title}
                className="card"
                style={{
                  padding: "1.3rem 1.4rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                <div
                  style={{
                    fontSize: "1rem",
                    fontWeight: 700,
                    color: "var(--color-fg)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {b.title}
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.9rem",
                    lineHeight: 1.55,
                    color: "var(--color-fg-muted)",
                  }}
                >
                  {b.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
