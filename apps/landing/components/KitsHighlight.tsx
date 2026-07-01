import { SectionHeader } from "./ValueProps";
import { KitCard } from "./KitCard";
import { KITS, DOCS_BASE } from "@/lib/kits";

/**
 * Compact kits teaser for the home page. Shows a featured subset of the catalog
 * (clickable cards) plus the "browse all" and "publish your own" funnels. The
 * full catalog + comparison lives on /kits.
 */
export function KitsHighlight() {
  const featured = KITS.slice(0, 6);
  return (
    <section
      className="section"
      id="kits"
      style={{ background: "var(--color-bg-elev)" }}
    >
      <div className="container-x">
        <SectionHeader
          kicker="0gkit Kits"
          title={
            <>
              Drop-in <span className="text-gradient">feature kits</span> for your 0G
              app.
            </>
          }
          sub="Add a working, typed, upgradeable feature at scaffold time or into an existing project — one command, the kit wires itself. Or build your own and publish it to the catalog."
        />

        <div
          style={{
            marginTop: "2.5rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "1rem",
          }}
        >
          {featured.map((kit) => (
            <KitCard key={kit.slug} kit={kit} />
          ))}
        </div>

        <div
          style={{
            marginTop: "2rem",
            display: "flex",
            gap: "0.75rem",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <a href="/kits" className="btn btn-primary">
            Browse all {KITS.length} kits
            <Arrow />
          </a>
          <a href={`${DOCS_BASE}/kits/authoring`} className="btn btn-ghost">
            Publish your own kit
          </a>
        </div>
      </div>
    </section>
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
