import { DOMAIN_COLORS, kitDocsUrl, type KitCardData } from "@/lib/kits";

/**
 * A clickable kit card. Wraps the shared `.card` surface in an anchor to the
 * kit's docs page, with an animated "View kit →" affordance (`.card-link`).
 */
export function KitCard({ kit }: { kit: KitCardData }) {
  const color = DOMAIN_COLORS[kit.domain] ?? "var(--color-fg-muted)";
  return (
    <a
      href={kitDocsUrl(kit.slug)}
      className="card card-link"
      style={{ padding: "1.3rem 1.4rem 1.4rem" }}
      aria-label={`${kit.name} kit — view docs`}
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
            color,
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

      <div style={{ marginTop: "auto" }}>
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
        <div
          className="card-cta"
          style={{
            marginTop: "0.8rem",
            fontSize: "0.8rem",
            fontWeight: 600,
            color: "var(--color-fg-muted)",
          }}
        >
          View kit
          <ArrowRight />
        </div>
      </div>
    </a>
  );
}

function ArrowRight() {
  return (
    <svg
      width="13"
      height="13"
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
