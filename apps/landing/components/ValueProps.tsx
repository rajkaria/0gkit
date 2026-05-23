type Prop = {
  title: string;
  desc: string;
  icon: React.ReactNode;
};

const PROPS: Prop[] = [
  {
    title: "One surface, every capability",
    desc: "Storage, compute, DA, attestation, and chain — all in one consistent TypeScript API. Stop juggling five different SDK shapes with five different error styles.",
    icon: <LayersIcon />,
  },
  {
    title: "Neutral by design",
    desc: "MIT-licensed. Zero hidden coupling. Every primitive exposes `.raw()` back to the official 0G SDK. The toolkit is a help, never a cage.",
    icon: <ShieldIcon />,
  },
  {
    title: "Actionable errors",
    desc: "Every failure is a typed `ZeroGError` with `.code`, `.hint`, and `.helpUrl`. The error tells you exactly which env var is missing or which broker to call.",
    icon: <AlertIcon />,
  },
  {
    title: "Agent-native from day one",
    desc: "MCP server, language-agnostic CLI with `--json`, and React hooks. Drive 0G from Claude, Cursor, the shell, the browser, or your Next.js app.",
    icon: <BotIcon />,
  },
  {
    title: "Cost preview on every write",
    desc: "Every primitive answers `.estimate()` and every write supports `{ dryRun: true }`. Know what an upload, inference, or DA publish will cost before you broadcast.",
    icon: <CoinIcon />,
  },
  {
    title: "Production-ready primitives",
    desc: "Reorg-safe indexer, durable job runner (memory/sqlite/redis), OpenTelemetry observability, a TEE attestation gate, typed contract clients. Not just a wrapper — a stack.",
    icon: <BoltIcon />,
  },
];

export function ValueProps() {
  return (
    <section className="section" id="why">
      <div className="container-x">
        <SectionHeader
          kicker="Why 0Gkit"
          title={
            <>
              Everything you need to ship on <span className="text-gradient">0G</span>,
              and nothing you don&apos;t.
            </>
          }
          sub="The 0G network ships five separate SDKs, each with its own shape, its own error style, and no shared concept of a receipt or a cost. 0Gkit unifies them — without hiding them."
        />

        <div
          style={{
            marginTop: "3rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "1rem",
          }}
        >
          {PROPS.map((p) => (
            <div
              key={p.title}
              className="card"
              style={{ padding: "1.4rem 1.4rem 1.5rem" }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background:
                    "color-mix(in srgb, var(--color-accent) 14%, var(--color-bg-card))",
                  border:
                    "1px solid color-mix(in srgb, var(--color-accent) 40%, var(--color-border))",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--color-accent-2)",
                  marginBottom: "0.9rem",
                }}
              >
                {p.icon}
              </div>
              <h3
                style={{
                  margin: "0 0 0.5rem",
                  fontSize: "1.05rem",
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                }}
              >
                {p.title}
              </h3>
              <p
                style={{
                  margin: 0,
                  color: "var(--color-fg-dim)",
                  fontSize: "0.92rem",
                  lineHeight: 1.55,
                }}
              >
                {p.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SectionHeader({
  kicker,
  title,
  sub,
  align = "center",
}: {
  kicker: string;
  title: React.ReactNode;
  sub?: string;
  align?: "center" | "left";
}) {
  return (
    <div
      style={{
        textAlign: align,
        maxWidth: 760,
        margin: align === "center" ? "0 auto" : 0,
      }}
    >
      <div
        style={{
          fontSize: "0.78rem",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          fontWeight: 700,
          color: "var(--color-accent-2)",
          marginBottom: "0.7rem",
        }}
      >
        {kicker}
      </div>
      <h2
        style={{
          margin: 0,
          fontSize: "clamp(1.7rem, 3.6vw, 2.6rem)",
          fontWeight: 800,
          letterSpacing: "-0.025em",
          lineHeight: 1.12,
        }}
      >
        {title}
      </h2>
      {sub ? (
        <p
          style={{
            marginTop: "1rem",
            color: "var(--color-fg-dim)",
            fontSize: "1.02rem",
            lineHeight: 1.55,
          }}
        >
          {sub}
        </p>
      ) : null}
    </div>
  );
}

function LayersIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
function AlertIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
function BotIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <line x1="12" y1="7" x2="12" y2="11" />
      <line x1="8" y1="16" x2="8" y2="16" />
      <line x1="16" y1="16" x2="16" y2="16" />
    </svg>
  );
}
function CoinIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <ellipse cx="12" cy="6" rx="9" ry="3" />
      <path d="M3 6v6c0 1.66 4.03 3 9 3s9-1.34 9-3V6" />
      <path d="M3 12v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6" />
    </svg>
  );
}
function BoltIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}
