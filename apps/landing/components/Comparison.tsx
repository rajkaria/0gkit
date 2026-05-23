import { SectionHeader } from "./ValueProps";

type Row = {
  concern: string;
  zerogkit: string;
  raw: string;
};

const ROWS: Row[] = [
  {
    concern: "Surface area",
    zerogkit:
      "One consistent TS API across storage / compute / DA / attestation / chain",
    raw: "Five separate SDKs, five different shapes, five different conventions",
  },
  {
    concern: "Errors",
    zerogkit: "Typed `ZeroGError` with `.code`, `.hint`, `.helpUrl`",
    raw: "Generic Error or string — no structured remediation",
  },
  {
    concern: "Receipts",
    zerogkit: "Uniform `Receipt` envelope (txHash, block, latency, explorer URL)",
    raw: "Each primitive returns its own ad-hoc shape",
  },
  {
    concern: "Cost preview",
    zerogkit: "`.estimate()` + `{ dryRun: true }` on every write",
    raw: "Roll your own gas + fee math, no encoder-level preview",
  },
  {
    concern: "CLI",
    zerogkit: "`0g` binary with `--json` — pipe into anything",
    raw: "None — write your own each project",
  },
  {
    concern: "Agent access (MCP)",
    zerogkit: "Every primitive as an `og_*` MCP tool out of the box",
    raw: "Not provided",
  },
  {
    concern: "React hooks",
    zerogkit: "`useUpload` · `useInference` · `useEvent` · `useLogs`",
    raw: "Not provided",
  },
  {
    concern: "Indexing",
    zerogkit: "Reorg-safe `Indexer` with persisted cursors (memory/sqlite/redis)",
    raw: "Roll your own polling + reorg detection",
  },
  {
    concern: "Background work",
    zerogkit: "Durable `JobRunner` with HMAC webhooks and backoff",
    raw: "Roll your own queue + delivery semantics",
  },
  {
    concern: "Observability",
    zerogkit: "OpenTelemetry instrumentation with `0g.*` semantic attributes",
    raw: "Not provided",
  },
  {
    concern: "Escape hatch",
    zerogkit: "`.raw()` on every primitive — you are never blocked",
    raw: "N/A (you are already there)",
  },
  {
    concern: "License",
    zerogkit: "MIT",
    raw: "MIT",
  },
];

export function Comparison() {
  return (
    <section className="section" style={{ background: "var(--color-bg-elev)" }}>
      <div className="container-x">
        <SectionHeader
          kicker="0gkit vs raw 0G SDKs"
          title={
            <>
              Same network.{" "}
              <span className="text-gradient">Better developer ergonomics.</span>
            </>
          }
          sub="0gkit doesn't hide the official 0G SDKs — every package re-exports them via `.raw()`. It just gives you the consistent surface you'd build yourself."
        />

        <div
          className="card"
          style={{
            marginTop: "2.5rem",
            overflow: "hidden",
            padding: 0,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(140px, 1.2fr) 2fr 2fr",
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
              0gkit
            </div>
            <div style={{ padding: "0.85rem 1rem" }}>Raw 0G SDKs</div>
          </div>

          {ROWS.map((row, i) => (
            <div
              key={row.concern}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(140px, 1.2fr) 2fr 2fr",
                borderBottom:
                  i === ROWS.length - 1 ? "none" : "1px solid var(--color-border)",
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
                  background: "color-mix(in srgb, var(--color-accent) 4%, transparent)",
                }}
              >
                {row.zerogkit}
              </div>
              <div
                style={{
                  padding: "0.85rem 1rem",
                  color: "var(--color-fg-muted)",
                }}
              >
                {row.raw}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
