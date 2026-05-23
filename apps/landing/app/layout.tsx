import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getLatestRelease } from "@/lib/version";
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

const SITE_URL = "https://0gkit.com";
const SITE_NAME = "0Gkit";
const TITLE = "0Gkit — The TypeScript Toolkit for the 0G Network";

export async function generateMetadata(): Promise<Metadata> {
  const release = await getLatestRelease();
  const DESCRIPTION = `Build on 0G in 60 seconds. 0Gkit is the neutral, MIT-licensed TypeScript toolkit for storage, compute, DA, attestation, and chain. One install: \`npm create 0gkit-app@latest\`. 18 packages. v${release.version} stable.`;
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: TITLE,
      template: "%s — 0Gkit",
    },
    description: DESCRIPTION,
    applicationName: SITE_NAME,
    keywords: [
      "0G",
      "0G network",
      "0G AI chain",
      "0G SDK",
      "0G TypeScript",
      "0Gkit",
      "0G storage",
      "0G compute",
      "0G inference",
      "0G data availability",
      "0G attestation",
      "TEE attestation",
      "verifiable AI",
      "decentralized AI",
      "create 0Gkit app",
      "npm create 0gkit-app",
      "MCP 0G",
      "0G chain developer toolkit",
      "0G chain typescript",
      "0G React hooks",
    ],
    authors: [{ name: "Foundry Protocol", url: "https://foundryprotocol.xyz" }],
    creator: "Foundry Protocol",
    publisher: "Foundry Protocol",
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      url: SITE_URL,
      title: TITLE,
      description: DESCRIPTION,
      siteName: SITE_NAME,
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: TITLE,
      description:
        "Build on 0G in 60 seconds. One install: `npm create 0gkit-app@latest`",
      site: "@foundryprotocol",
      creator: "@foundryprotocol",
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    icons: {
      icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
      shortcut: "/icon.svg",
      apple: "/icon.svg",
    },
    category: "Developer Tools",
  };
}

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geist.variable} ${geistMono.variable}`}
    >
      <body
        style={{
          fontFamily:
            "var(--font-geist), 'Regola Pro', ui-sans-serif, system-ui, sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
