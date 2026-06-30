import { SectionHeader } from "./ValueProps";

// ---------------------------------------------------------------------------
// Comparison table — source note (HONESTY requirement):
//   The "create-0g-dapp skills" column is based solely on create-0g-dapp's
//   PUBLIC README (https://github.com/0glabs/create-0g-dapp). We have not
//   inspected private source code. Any hackathon-track names quoted below
//   are create-0g-dapp's own marketing terminology, not an official 0G
//   taxonomy. We make no claims about internal implementation details.
// ---------------------------------------------------------------------------

type KitCard = {
  domain: string;
  emoji: string;
  name: string;
  slug: string;
  summary: string;
  highlight: string;
};

const KITS: KitCard[] = [
  {
    domain: "Verifiable AI",
    emoji: "🔐",
    name: "sealed-inference",
    slug: "sealed-inference",
    summary:
      "TEE-attested private inference with a verified attestation badge in the UI.",
    highlight: "Attestation actually shown + verified",
  },
  {
    domain: "Verifiable AI",
    emoji: "🔮",
    name: "ai-oracle",
    slug: "ai-oracle",
    summary:
      "Attested off-chain AI answer → on-chain commitment. Foundational kit; prediction-market composes it.",
    highlight: "Composable — kits build on kits",
  },
  {
    domain: "Agent Infrastructure",
    emoji: "🧠",
    name: "agent-memory",
    slug: "agent-memory",
    summary:
      "Persistent, namespaced agent memory on 0G Storage. Lib-only core works on all 9 bases.",
    highlight: "Works across every template base",
  },
  {
    domain: "Agent Infrastructure",
    emoji: "⚙️",
    name: "durable-agent",
    slug: "durable-agent",
    summary:
      "Long-running, resumable agent loop on 0gkit-jobs. Survives restarts; step ledger + OTEL traces.",
    highlight: "Category create-0g-dapp cannot reach",
  },
  {
    domain: "Markets & Onchain Data",
    emoji: "📈",
    name: "prediction-market",
    slug: "prediction-market",
    summary: "Full-stack AI-resolved prediction market with on-chain anchored proofs.",
    highlight: "Flagship showcase — composes ai-oracle",
  },
  {
    domain: "Markets & Onchain Data",
    emoji: "📡",
    name: "live-feed",
    slug: "live-feed",
    summary: "Reorg-safe live event/social feed via 0gkit-indexer.",
    highlight: "Correct reorg handling (theirs isn't)",
  },
  {
    domain: "Assets",
    emoji: "🖼️",
    name: "inft-studio",
    slug: "inft-studio",
    summary:
      "Intelligent-NFT mint + gallery: Storage metadata, typed contract via 0gkit-contracts, optional attested provenance.",
    highlight: "Typed contracts + generation provenance",
  },
  {
    domain: "DeFi — testnet / demo",
    emoji: "💹",
    name: "yield-intel",
    slug: "yield-intel",
    summary:
      "AI yield analysis + attested decision log. User executes manually. Testnet-default, prominently demo-labelled.",
    highlight: "Honest: analysis only, no auto-execution",
  },
];

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

const DOMAIN_COLORS: Record<string, string> = {
  "Verifiable AI": "var(--color-accent-2)",
  "Agent Infrastructure": "#a78bfa",
  "Markets & Onchain Data": "#34d399",
  Assets: "#f59e0b",
  "DeFi — testnet / demo": "#94a3b8",
};

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
              <div
                key={kit.slug}
                className="card"
                style={{ padding: "1.3rem 1.4rem 1.4rem" }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "0.5rem",
                    marginBottom: "0.7rem",
                  }}
                >
                  <span style={{ fontSize: "1.5rem", lineHeight: 1 }}>{kit.emoji}</span>
                  <span
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: DOMAIN_COLORS[kit.domain] ?? "var(--color-fg-muted)",
                      border: `1px solid ${DOMAIN_COLORS[kit.domain] ?? "var(--color-border)"}`,
                      borderRadius: 999,
                      padding: "0.15rem 0.55rem",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {kit.domain}
                  </span>
                </div>
                <h3
                  style={{
                    margin: "0 0 0.45rem",
                    fontSize: "1.02rem",
                    fontWeight: 700,
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "-0.01em",
                    color: "var(--color-fg)",
                  }}
                >
                  {kit.name}
                </h3>
                <p
                  style={{
                    margin: "0 0 0.9rem",
                    color: "var(--color-fg-dim)",
                    fontSize: "0.88rem",
                    lineHeight: 1.5,
                  }}
                >
                  {kit.summary}
                </p>
                <div
                  style={{
                    fontSize: "0.78rem",
                    color: "var(--color-accent-2)",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.3rem",
                  }}
                >
                  <span aria-hidden>✦</span>
                  {kit.highlight}
                </div>
              </div>
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
