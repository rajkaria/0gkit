import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "0gkit-status — live 0G network dashboard",
  description:
    "A live 0G network status dashboard, built by composing the agent-memory + live-feed 0gkit kits on the published @foundryprotocol/0gkit-* packages.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
