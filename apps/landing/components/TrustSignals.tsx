import { getLatestRelease } from "@/lib/version";

import type { ReactNode } from "react";

type Stat = {
  value: string;
  label: string;
  sub?: ReactNode;
};

export async function TrustSignals() {
  const release = await getLatestRelease();
  const STATS: Stat[] = [
    {
      value: `v${release.version}`,
      label: "API stable",
      sub: "Public surface frozen until v2",
    },
    {
      value: "18",
      label: "packages on npm",
      sub: "Install only what you use",
    },
    {
      value: "600+",
      label: "tests passing",
      sub: "CI gate on every PR",
    },
    {
      value: "MIT",
      label: "open source",
      sub: "No strings, no contracts",
    },
    {
      value: "8",
      label: "kits",
      sub: (
        <a href="/kits" style={{ color: "inherit", textDecoration: "underline" }}>
          0g add &lt;kit&gt; →
        </a>
      ),
    },
  ];
  return (
    <section style={{ paddingTop: "3.5rem", paddingBottom: "0.5rem" }}>
      <div className="container-x">
        <div
          className="card"
          style={{
            padding: "1.6rem 1.4rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "1.2rem",
          }}
        >
          {STATS.map((s) => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div
                className="text-gradient"
                style={{
                  fontSize: "clamp(1.6rem, 3.2vw, 2.1rem)",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {s.value}
              </div>
              <div
                style={{
                  marginTop: "0.3rem",
                  fontSize: "0.95rem",
                  color: "var(--color-fg)",
                  fontWeight: 600,
                }}
              >
                {s.label}
              </div>
              {s.sub ? (
                <div
                  style={{
                    marginTop: "0.15rem",
                    fontSize: "0.78rem",
                    color: "var(--color-fg-muted)",
                  }}
                >
                  {s.sub}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
