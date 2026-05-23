import { SectionHeader } from "./ValueProps";

type Pkg = {
  name: string;
  desc: string;
  npm: string;
};

type Layer = {
  title: string;
  caption: string;
  accent: string;
  pkgs: Pkg[];
};

const LAYERS: Layer[] = [
  {
    title: "Foundation",
    caption: "Network presets, clients, receipts, errors. The shared base.",
    accent: "#22d3ee",
    pkgs: [
      {
        name: "0gkit-core",
        desc: "Networks, viem client, Receipt envelope, ZeroGError taxonomy",
        npm: "@foundryprotocol/0gkit-core",
      },
    ],
  },
  {
    title: "Primitives",
    caption:
      "One thin, faithful wrapper per 0G capability. Drop any of them at any time.",
    accent: "#22d3ee",
    pkgs: [
      {
        name: "0gkit-chain",
        desc: "Faucet · balance · waitForReceipt · explorer URLs",
        npm: "@foundryprotocol/0gkit-chain",
      },
      {
        name: "0gkit-storage",
        desc: "upload · download · computeRoot · exists · dryRun",
        npm: "@foundryprotocol/0gkit-storage",
      },
      {
        name: "0gkit-compute",
        desc: "Broker discovery · inference · OpenAI-compatible shim",
        npm: "@foundryprotocol/0gkit-compute",
      },
      {
        name: "0gkit-da",
        desc: "Deterministic digest · encoder publish · local verify",
        npm: "@foundryprotocol/0gkit-da",
      },
      {
        name: "0gkit-attestation",
        desc: "Parse · sign · recover · verify TEE envelopes (pure crypto)",
        npm: "@foundryprotocol/0gkit-attestation",
      },
      {
        name: "0gkit-contracts",
        desc: "wagmi-style typed clients · Foundry codegen",
        npm: "@foundryprotocol/0gkit-contracts",
      },
      {
        name: "0gkit-wallet",
        desc: "fromEnv() · KMS · keystore · private key signers",
        npm: "@foundryprotocol/0gkit-wallet",
      },
      {
        name: "0gkit-wallet-react",
        desc: "Wallet provider + hooks for RSC-first React apps",
        npm: "@foundryprotocol/0gkit-wallet-react",
      },
    ],
  },
  {
    title: "Developer surfaces",
    caption:
      "Same primitives, different mouths — CLI, MCP, React, indexer, jobs, observability.",
    accent: "#a78bfa",
    pkgs: [
      {
        name: "0gkit-cli",
        desc: "The `0g` binary — init, doctor, storage, infer, da, attest, estimate, jobs",
        npm: "@foundryprotocol/0gkit-cli",
      },
      {
        name: "0gkit-mcp",
        desc: "MCP server: every primitive as an `og_*` tool for Claude/Cursor/Cline",
        npm: "@foundryprotocol/0gkit-mcp",
      },
      {
        name: "0gkit-react",
        desc: "useUpload · useDownload · useInference · useEvent · useLogs",
        npm: "@foundryprotocol/0gkit-react",
      },
      {
        name: "0gkit-indexer",
        desc: "Reorg-safe event subscriptions with memory/sqlite/redis cursors",
        npm: "@foundryprotocol/0gkit-indexer",
      },
      {
        name: "0gkit-jobs",
        desc: "Durable job runner — at-least-once · backoff · webhooks · memory/sqlite/redis",
        npm: "@foundryprotocol/0gkit-jobs",
      },
      {
        name: "0gkit-observability",
        desc: "OpenTelemetry instrumentation · `0g.*` span attributes · 0g cost forecast",
        npm: "@foundryprotocol/0gkit-observability",
      },
      {
        name: "0gkit-testing",
        desc: "Mocks · fixtures · vitest matchers · setupLocalDevnet",
        npm: "@foundryprotocol/0gkit-testing",
      },
      {
        name: "0gkit-devnet",
        desc: "One-command local stack — storage CAS + chain + faucet",
        npm: "@foundryprotocol/0gkit-devnet",
      },
    ],
  },
  {
    title: "Scaffolder",
    caption: "Discover via Google. Install via npm. Templates land you in 60 seconds.",
    accent: "#22d3ee",
    pkgs: [
      {
        name: "create-0gkit-app",
        desc: "9 archetypes — storage-app · chat · ai-agent · tee-attested-api · nft · …",
        npm: "create-0gkit-app",
      },
    ],
  },
];

export function PackageMap() {
  return (
    <section className="section" id="packages">
      <div className="container-x">
        <SectionHeader
          kicker="The package map"
          title={
            <>
              18 packages. Pick one, pick six, or{" "}
              <span className="text-gradient">scaffold an app.</span>
            </>
          }
          sub="The dependency direction is always one way: primitives depend on `core`; surfaces depend on the primitives. No cycles. No surprise transitive deps."
        />

        <div style={{ marginTop: "3rem", display: "grid", gap: "1.5rem" }}>
          {LAYERS.map((layer) => (
            <div key={layer.title}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "0.7rem",
                  marginBottom: "0.85rem",
                  flexWrap: "wrap",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: "0.78rem",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    fontWeight: 700,
                    color: "var(--color-fg-dim)",
                  }}
                >
                  Layer — {layer.title}
                </h3>
                <span
                  style={{
                    color: "var(--color-fg-muted)",
                    fontSize: "0.85rem",
                  }}
                >
                  {layer.caption}
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: "0.7rem",
                }}
              >
                {layer.pkgs.map((p) => (
                  <a
                    key={p.name}
                    href={`https://www.npmjs.com/package/${encodeURIComponent(p.npm)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="card"
                    style={{
                      padding: "0.95rem 1.05rem 1rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.45rem",
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.85rem",
                        color: "var(--color-fg)",
                      }}
                    >
                      <span style={{ color: layer.accent }}>▸</span>
                      <span>{p.name}</span>
                    </div>
                    <div
                      style={{
                        color: "var(--color-fg-dim)",
                        fontSize: "0.82rem",
                        lineHeight: 1.5,
                      }}
                    >
                      {p.desc}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
