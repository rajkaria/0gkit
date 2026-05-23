import { Logo } from "./Logo";
import { getLatestRelease } from "@/lib/version";

export async function Nav() {
  const release = await getLatestRelease();
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        backdropFilter: "saturate(140%) blur(12px)",
        background: "color-mix(in srgb, var(--color-bg) 75%, transparent)",
        borderBottom:
          "1px solid color-mix(in srgb, var(--color-border) 80%, transparent)",
      }}
    >
      <div
        className="container-x"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          height: "60px",
        }}
      >
        <a
          href="/"
          style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}
          aria-label="0Gkit home"
        >
          <Logo size={28} />
          <span
            style={{ fontSize: "1.05rem", fontWeight: 700, letterSpacing: "-0.01em" }}
          >
            0Gkit
          </span>
          <span
            className="pill pill-accent"
            style={{
              marginLeft: "0.4rem",
              fontSize: "0.68rem",
              padding: "0.15rem 0.55rem",
            }}
          >
            <span className="pill-dot" />v{release.version}
          </span>
        </a>

        <span style={{ flex: 1 }} />

        <nav
          aria-label="primary"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1.4rem",
            color: "var(--color-fg-dim)",
            fontSize: "0.9rem",
          }}
        >
          <a
            href="https://docs.0gkit.com"
            style={{ transition: "color 150ms" }}
            className="hover:!text-white"
          >
            Docs
          </a>
          <a href="#packages" className="hover:!text-white">
            Packages
          </a>
          <a href="https://playground.0gkit.com" className="hover:!text-white">
            Playground
          </a>
          <a
            href="https://github.com/rajkaria/0gkit"
            target="_blank"
            rel="noreferrer"
            className="hover:!text-white"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}
