import { InstallCommand } from "./InstallCommand";

export function CTABottom() {
  return (
    <section className="section" style={{ position: "relative" }}>
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(50% 60% at 50% 50%, color-mix(in srgb, var(--color-accent) 14%, transparent), transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        className="container-x"
        style={{ position: "relative", textAlign: "center" }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "clamp(1.9rem, 4.5vw, 3.2rem)",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
          }}
        >
          Stop wiring SDKs. Start <span className="text-gradient">shipping on 0G.</span>
        </h2>
        <p
          style={{
            margin: "1.1rem auto 0",
            maxWidth: 560,
            color: "var(--color-fg-dim)",
            fontSize: "1.02rem",
            lineHeight: 1.55,
          }}
        >
          One command picks a template, writes a network-aware{" "}
          <code style={{ color: "var(--color-accent-2)", background: "transparent" }}>
            .env.example
          </code>
          , installs deps, and runs{" "}
          <code style={{ color: "var(--color-accent-2)", background: "transparent" }}>
            git init
          </code>
          . The next step is{" "}
          <code style={{ color: "var(--color-accent-2)", background: "transparent" }}>
            cd
          </code>
          .
        </p>

        <div style={{ marginTop: "1.8rem", display: "flex", justifyContent: "center" }}>
          <InstallCommand />
        </div>

        <div
          style={{
            marginTop: "1.2rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.6rem",
            flexWrap: "wrap",
          }}
        >
          <a href="https://docs.0gkit.com/getting-started" className="btn btn-primary">
            60-second tutorial
          </a>
          <a
            href="https://github.com/rajkaria/0gkit/tree/main/templates"
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost"
          >
            Browse 9 templates
          </a>
        </div>
      </div>
    </section>
  );
}
