import { DOCS_BASE } from "@/lib/kits";

/**
 * "Build & publish your own kit" panel — the community catalog funnel. A kit
 * you publish becomes available to every project using 0gkit (`0g add <kit>`),
 * turning the catalog into a shared skills repo for 0G.
 */
export function AuthorKitCTA() {
  return (
    <div
      className="card"
      style={{
        marginTop: "3rem",
        padding: "2rem 1.8rem",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)",
        gap: "1.8rem",
        alignItems: "center",
      }}
    >
      <div>
        <div
          className="pill pill-accent"
          style={{ marginBottom: "1rem", display: "inline-flex" }}
        >
          <span className="pill-dot" />A skills repo for 0G
        </div>
        <h3
          style={{
            margin: "0 0 0.6rem",
            fontSize: "clamp(1.3rem, 2.4vw, 1.7rem)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
          }}
        >
          Built a reusable 0G pattern?{" "}
          <span className="text-gradient">Publish it as a kit.</span>
        </h3>
        <p
          style={{
            margin: "0 0 1.3rem",
            color: "var(--color-fg-dim)",
            fontSize: "0.96rem",
            lineHeight: 1.6,
            maxWidth: "48ch",
          }}
        >
          One command scaffolds a registry-valid kit — portable core, per-base adapters,
          an optional React UI, and a docs stub. Open a PR to the catalog and every
          project on 0gkit can install it with{" "}
          <code style={{ color: "var(--color-accent-2)", background: "transparent" }}>
            0g add
          </code>
          .
        </p>
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <a href={`${DOCS_BASE}/kits/authoring`} className="btn btn-primary">
            Build &amp; publish a kit
            <Arrow />
          </a>
          <a
            href="https://github.com/rajkaria/0gkit/tree/main/templates/_kits"
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost"
          >
            Browse kit sources
          </a>
        </div>
      </div>

      <div
        style={{
          background: "var(--color-code-bg)",
          border: "1px solid var(--color-border-strong)",
          borderRadius: "12px",
          padding: "1.1rem 1.2rem",
          fontFamily: "var(--font-mono)",
          fontSize: "0.86rem",
          lineHeight: 1.7,
          overflowX: "auto",
        }}
      >
        <div style={{ color: "var(--color-fg-muted)" }}># scaffold a new kit</div>
        <div>
          <span style={{ color: "var(--color-fg-muted)" }} aria-hidden>
            ${" "}
          </span>
          <span style={{ color: "var(--color-fg)" }}>0g kits new </span>
          <span style={{ color: "var(--color-brand-1)" }}>my-kit</span>
        </div>
        <div style={{ color: "var(--color-fg-muted)", marginTop: "0.5rem" }}>
          # …fill it in, then
        </div>
        <div>
          <span style={{ color: "var(--color-fg-muted)" }} aria-hidden>
            ${" "}
          </span>
          <span style={{ color: "var(--color-fg)" }}>pnpm kits:check</span>
        </div>
      </div>
    </div>
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
