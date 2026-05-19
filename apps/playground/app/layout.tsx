import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "0gkit playground",
  description:
    "Zero-setup web console for 0G: upload, infer, verify an attestation — and copy working code in CLI, TypeScript, curl, or MCP form.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
