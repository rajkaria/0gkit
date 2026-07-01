import { SectionHeader } from "./ValueProps";
import { KitCard } from "./KitCard";
import { AuthorKitCTA } from "./AuthorKitCTA";
import { KITS } from "@/lib/kits";

// ---------------------------------------------------------------------------
// Comparison table — source note (HONESTY requirement):
//   The "create-0g-dapp skills" column is based solely on create-0g-dapp's
//   PUBLIC README (https://github.com/0glabs/create-0g-dapp). We have not
//   inspected private source code. Any hackathon-track names quoted below
//   are create-0g-dapp's own marketing terminology, not an official 0G
//   taxonomy. We make no claims about internal implementation details.
// ---------------------------------------------------------------------------

// Comparison rows — all claims are verifiable from create-0g-dapp's public README.
type CompRow = { concern: string; kits: string; createDapp: string };
const COMP_ROWS: CompRow[] = [
  {
    concern: "Upgradeability",
    kits: "Logic in versioned 0gkit-* packages; overlay is thin glue — `0g update` is real",
    createDapp: "Code dump — once generated, nothing to upgrade¹",
  },
  {
    concern: "Framework support",
    kits: "One kit works across React, Hono, MCP, Node bases",
    createDapp: "Next.js-only scaffold (single base)¹",
  },
  {
    concern: "Error handling",
    kits: "Typed ZeroGError + 45-code taxonomy + helpUrl surfaced in kit UI",
    createDapp: "Inherits the underlying SDK's error shape (untyped)¹",
  },
  {
    concern: "Durability",
    kits: "durable-agent kit: restartable loop on 0gkit-jobs",
    createDapp: "No durable agent primitive in README¹",
  },
  {
    concern: "Composition",
    kits: "prediction-market composes ai-oracle; engine handles dep order",
    createDapp: "No kit-composes-kit mechanism in README¹",
  },
  {
    concern: "CI coverage",
    kits: "Every (kit × base) combo typecheck+build gated: `pnpm kits:check`",
    createDapp: "No public per-combo CI gate documented¹",
  },
  {
    concern: "Observability",
    kits: "0gkit-observability OpenTelemetry wired into durable-agent",
    createDapp: "Not documented in README¹",
  },
  {
    concern: "License",
    kits: "MIT",
    createDapp: "MIT¹",
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

      {/* ── Comparison table ────────────────────────────────────────── */}
      <section
        className="section"
        style={{ background: "var(--color-bg-elev)" }}
        id="kits-comparison"
      >
        <div className="container-x">
          <SectionHeader
            kicker="How kits compare"
            title={
              <>
                Structural advantages over{" "}
                <span className="text-gradient">skills-style scaffolds.</span>
              </>
            }
            sub="create-0g-dapp's skills are a sharp GTM hook. But they have three structural ceilings — each one a 0gkit Kits strength."
          />

          <div
            className="card"
            style={{
              marginTop: "2.5rem",
              overflow: "hidden",
              padding: 0,
            }}
          >
            {/* Header row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(140px, 1.4fr) 2fr 2fr",
                borderBottom: "1px solid var(--color-border)",
                background:
                  "color-mix(in srgb, var(--color-bg) 50%, var(--color-bg-card))",
                fontSize: "0.78rem",
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: "var(--color-fg-muted)",
              }}
            >
              <div style={{ padding: "0.85rem 1rem" }}>Concern</div>
              <div style={{ padding: "0.85rem 1rem", color: "var(--color-accent-2)" }}>
                0gkit Kits
              </div>
              <div style={{ padding: "0.85rem 1rem" }}>create-0g-dapp skills</div>
            </div>

            {COMP_ROWS.map((row, i) => (
              <div
                key={row.concern}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(140px, 1.4fr) 2fr 2fr",
                  borderBottom:
                    i === COMP_ROWS.length - 1
                      ? "none"
                      : "1px solid var(--color-border)",
                  fontSize: "0.9rem",
                }}
              >
                <div
                  style={{
                    padding: "0.85rem 1rem",
                    color: "var(--color-fg-dim)",
                    fontWeight: 600,
                  }}
                >
                  {row.concern}
                </div>
                <div
                  style={{
                    padding: "0.85rem 1rem",
                    color: "var(--color-fg)",
                    background:
                      "color-mix(in srgb, var(--color-accent) 4%, transparent)",
                  }}
                >
                  {row.kits}
                </div>
                <div
                  style={{
                    padding: "0.85rem 1rem",
                    color: "var(--color-fg-muted)",
                  }}
                >
                  {row.createDapp}
                </div>
              </div>
            ))}
          </div>

          {/* HONESTY footnote — required by the brief */}
          <p
            style={{
              marginTop: "1rem",
              fontSize: "0.75rem",
              color: "var(--color-fg-muted)",
              lineHeight: 1.5,
            }}
          >
            <sup>1</sup> Comparison based on create-0g-dapp&rsquo;s{" "}
            <a
              href="https://github.com/0glabs/create-0g-dapp"
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--color-fg-dim)", textDecoration: "underline" }}
            >
              public README
            </a>
            , not its private source. Any hackathon-track names are
            create-0g-dapp&rsquo;s own terminology — they are not an official 0G
            taxonomy and are not adopted here.
          </p>
        </div>
      </section>
    </>
  );
}
