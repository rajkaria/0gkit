import { InstallCommand } from "./InstallCommand";
import { HeroBackground } from "./HeroBackground";

export function Hero() {
  return (
    <section
      style={{
        position: "relative",
        paddingTop: "4.5rem",
        paddingBottom: "5rem",
        overflow: "hidden",
      }}
    >
      <HeroBackground />
      <div
        className="container-x"
        style={{ position: "relative", textAlign: "center", zIndex: 1 }}
      >
        <a
          href="https://github.com/rajkaria/0gkit/releases/tag/v1.0.0"
          target="_blank"
          rel="noreferrer"
          className="pill pill-accent rise rise-d-1"
          style={{ marginBottom: "1.8rem" }}
        >
          <span className="pill-dot" />
          v1.0.0 shipped — 18 packages on npm, API stable until v2 →
        </a>

        <h1
          className="rise rise-d-2"
          style={{
            margin: "0 auto",
            fontSize: "clamp(2.6rem, 7vw, 5.2rem)",
            lineHeight: 1.03,
            letterSpacing: "-0.038em",
            fontWeight: 800,
            maxWidth: "20ch",
          }}
        >
          Build on <span className="text-gradient">0G</span> in 60 seconds.
        </h1>

        <p
          className="rise rise-d-3"
          style={{
            margin: "1.6rem auto 0",
            maxWidth: "660px",
            fontSize: "clamp(1.02rem, 1.85vw, 1.2rem)",
            color: "var(--color-fg-dim)",
            lineHeight: 1.55,
          }}
        >
          <strong style={{ color: "var(--color-fg)" }}>0Gkit</strong> is the neutral,
          MIT-licensed TypeScript toolkit for the entire{" "}
          <a
            href="https://0g.ai"
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--color-brand-2)" }}
          >
            0G network
          </a>
          . Storage, compute, DA, attestation, and chain — one consistent surface across
          18 small, composable packages. No framework. No lock-in. Just 0G.
        </p>

        <div
          className="rise rise-d-4"
          style={{
            marginTop: "2.4rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <InstallCommand glow />
        </div>

        <div
          className="rise rise-d-5"
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
            Get started
            <Arrow />
          </a>
          <a href="https://docs.0gkit.com" className="btn btn-ghost">
            Read the docs
          </a>
          <a
            href="https://github.com/rajkaria/0gkit"
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost"
          >
            <GitHubIcon /> GitHub
          </a>
        </div>

        <p
          className="rise rise-d-5"
          style={{
            marginTop: "1.6rem",
            fontSize: "0.82rem",
            color: "var(--color-fg-muted)",
          }}
        >
          MIT licensed · TypeScript-first · Works with raw 0G SDKs (escape hatch on
          every primitive)
        </p>
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

function GitHubIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.05-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.21.08 1.84 1.24 1.84 1.24 1.07 1.84 2.82 1.31 3.51 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23.96-.27 1.98-.4 3-.4s2.04.14 3 .4c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.49 5.92.43.37.82 1.1.82 2.22 0 1.6-.01 2.89-.01 3.28 0 .32.22.7.83.58C20.56 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}
