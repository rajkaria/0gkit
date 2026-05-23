import { Logo } from "./Logo";

const MAINTAINER = {
  name: "Raj Karia",
  telegram: "https://t.me/rajkaria",
  x: "https://x.com/rajkaria_",
};

export function Footer() {
  return (
    <footer
      className="hairline"
      style={{
        paddingTop: "3rem",
        paddingBottom: "3rem",
        marginTop: "2rem",
        color: "var(--color-fg-muted)",
        fontSize: "0.88rem",
      }}
    >
      <div
        className="container-x"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "2rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
            <Logo size={26} />
            <strong style={{ color: "var(--color-fg)", fontSize: "1rem" }}>
              0Gkit
            </strong>
          </div>
          <p style={{ marginTop: "0.7rem", lineHeight: 1.55 }}>
            The neutral TypeScript toolkit for the{" "}
            <a
              href="https://0g.ai"
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--color-accent-2)" }}
            >
              0G network
            </a>
            . MIT-licensed.
          </p>
          <p style={{ marginTop: "0.6rem", lineHeight: 1.55 }}>
            Maintained by{" "}
            <a
              href={MAINTAINER.x}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--color-accent-2)" }}
            >
              {MAINTAINER.name}
            </a>
            .
          </p>
          <div
            style={{
              marginTop: "0.9rem",
              display: "flex",
              alignItems: "center",
              gap: "0.7rem",
            }}
          >
            <a
              href={MAINTAINER.x}
              target="_blank"
              rel="noreferrer"
              aria-label="Maintainer on X"
              title="Reach the maintainer on X"
              style={socialIconStyle}
            >
              <XIcon />
            </a>
            <a
              href={MAINTAINER.telegram}
              target="_blank"
              rel="noreferrer"
              aria-label="Maintainer on Telegram"
              title="Reach the maintainer on Telegram"
              style={socialIconStyle}
            >
              <TelegramIcon />
            </a>
            <a
              href="https://github.com/rajkaria/0gkit"
              target="_blank"
              rel="noreferrer"
              aria-label="0Gkit on GitHub"
              title="0Gkit on GitHub"
              style={socialIconStyle}
            >
              <GitHubIcon />
            </a>
          </div>
        </div>

        <FooterCol
          title="Product"
          links={[
            { label: "Docs", href: "https://docs.0gkit.com" },
            { label: "Packages", href: "#packages" },
            { label: "CLI", href: "https://docs.0gkit.com/cli" },
            { label: "Playground", href: "https://playground.0gkit.com" },
          ]}
        />

        <FooterCol
          title="Resources"
          links={[
            {
              label: "Getting started",
              href: "https://docs.0gkit.com/getting-started",
            },
            { label: "Concepts", href: "https://docs.0gkit.com/concepts" },
            { label: "Error codes", href: "https://docs.0gkit.com/errors" },
            { label: "MCP guide", href: "https://docs.0gkit.com/mcp" },
            { label: "React guide", href: "https://docs.0gkit.com/react" },
          ]}
        />

        <FooterCol
          title="Community"
          links={[
            { label: "GitHub", href: "https://github.com/rajkaria/0gkit" },
            {
              label: "Discussions",
              href: "https://github.com/rajkaria/0gkit/discussions",
            },
            { label: "Issues", href: "https://github.com/rajkaria/0gkit/issues" },
            {
              label: "Contributing",
              href: "https://github.com/rajkaria/0gkit/blob/main/CONTRIBUTING.md",
            },
            { label: "Maintainer X", href: MAINTAINER.x },
            { label: "Maintainer Telegram", href: MAINTAINER.telegram },
            {
              label: "Changelog",
              href: "https://github.com/rajkaria/0gkit/releases",
            },
          ]}
        />
      </div>

      <div
        className="container-x"
        style={{
          marginTop: "2.5rem",
          paddingTop: "1.5rem",
          borderTop: "1px solid var(--color-border)",
          display: "flex",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
          fontSize: "0.8rem",
        }}
      >
        <span>
          © {new Date().getFullYear()}{" "}
          <a
            href={MAINTAINER.x}
            target="_blank"
            rel="noreferrer"
            style={{ color: "inherit" }}
          >
            {MAINTAINER.name}
          </a>
          . Released under MIT.
        </span>
        <span style={{ display: "flex", gap: "1rem" }}>
          <a
            href="https://github.com/rajkaria/0gkit/blob/main/SECURITY.md"
            target="_blank"
            rel="noreferrer"
          >
            Security
          </a>
          <a
            href="https://github.com/rajkaria/0gkit/blob/main/LICENSE"
            target="_blank"
            rel="noreferrer"
          >
            License
          </a>
          <a href="https://0g.ai" target="_blank" rel="noreferrer">
            0G network ↗
          </a>
        </span>
      </div>
    </footer>
  );
}

const socialIconStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "32px",
  height: "32px",
  borderRadius: "8px",
  border: "1px solid var(--color-border)",
  color: "var(--color-fg-dim)",
  transition: "color 120ms ease, border-color 120ms ease, background 120ms ease",
};

function XIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M18.244 2H21.5l-7.518 8.591L23 22h-6.93l-5.43-7.094L4.36 22H1.1l8.04-9.193L1 2h7.116l4.91 6.488L18.244 2zm-1.215 18.121h1.83L7.07 3.795H5.108l11.92 16.326z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-1.97c-3.2.69-3.88-1.54-3.88-1.54-.52-1.33-1.27-1.68-1.27-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.27-5.24-5.67 0-1.25.44-2.27 1.17-3.07-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.14 1.17a10.86 10.86 0 015.71 0c2.18-1.48 3.14-1.17 3.14-1.17.62 1.59.23 2.76.11 3.05.73.8 1.17 1.82 1.17 3.07 0 4.41-2.7 5.37-5.27 5.66.41.35.78 1.04.78 2.09v3.1c0 .31.21.66.79.55C20.21 21.38 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <div
        style={{
          fontSize: "0.72rem",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          fontWeight: 700,
          color: "var(--color-fg-dim)",
          marginBottom: "0.7rem",
        }}
      >
        {title}
      </div>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "grid",
          gap: "0.45rem",
        }}
      >
        {links.map((l) => (
          <li key={l.href}>
            <a
              href={l.href}
              target={l.href.startsWith("http") ? "_blank" : undefined}
              rel={l.href.startsWith("http") ? "noreferrer" : undefined}
              style={{ color: "var(--color-fg-dim)" }}
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
