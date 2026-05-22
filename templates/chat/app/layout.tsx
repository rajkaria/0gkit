import { Providers } from "./providers";

export const metadata = {
  title: "0gkit chat",
  description: "Real-time chat — messages on 0G Storage, indexed live.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          maxWidth: 720,
          margin: "0 auto",
          padding: "2rem",
        }}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
