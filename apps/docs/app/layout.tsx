import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { Sidebar } from "../components/Sidebar";
import { Search } from "../components/Search";
import { Logo } from "../components/Logo";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "0Gkit — the neutral 0G builder toolkit",
    template: "%s — 0Gkit docs",
  },
  description:
    "Complete documentation for 0Gkit: Storage, Compute, DA, Attestation, Chain, the 0g CLI, an MCP server, and React hooks for the 0G network.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geist.variable} ${geistMono.variable}`}
    >
      <body>
        <div className="layout">
          <div style={{ width: "100%" }}>
            <header className="topbar">
              <Link
                href="/"
                style={{
                  color: "inherit",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.55rem",
                }}
              >
                <Logo size={26} />
                <strong>0Gkit</strong>
              </Link>
              <span className="topbar-tag">docs</span>
              <span className="spacer" />
              <Search />
              <a href="https://0gkit.com" target="_blank" rel="noreferrer">
                ↗ Home
              </a>
              <a href="https://playground.0gkit.com" target="_blank" rel="noreferrer">
                Playground
              </a>
              <a
                href="https://github.com/rajkaria/0gkit"
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
            </header>
            <div className="shell">
              <Sidebar />
              <main className="content">
                <article className="prose">{children}</article>
              </main>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
