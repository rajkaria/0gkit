import { Logo } from "./Logo";

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
            . MIT-licensed. Built by{" "}
            <a
              href="https://foundryprotocol.xyz"
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--color-accent-2)" }}
            >
              Foundry Protocol
            </a>
            .
          </p>
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
        <span>© {new Date().getFullYear()} Foundry Protocol. Released under MIT.</span>
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
