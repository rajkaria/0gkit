// Shared kit catalog data for the landing site. The per-kit detail pages live
// in the docs app (docs.0gkit.com/kits/<slug>), so cards link there.

export type KitCardData = {
  domain: string;
  emoji: string;
  name: string;
  slug: string;
  summary: string;
  highlight: string;
};

export const DOCS_BASE = "https://docs.0gkit.com";

export function kitDocsUrl(slug: string): string {
  return `${DOCS_BASE}/kits/${slug}`;
}

export const DOMAIN_COLORS: Record<string, string> = {
  "Verifiable AI": "var(--color-accent-2)",
  "Agent Infrastructure": "#a78bfa",
  "Markets & Onchain Data": "#34d399",
  Assets: "#f59e0b",
  "DeFi — testnet / demo": "#94a3b8",
};

export const KITS: KitCardData[] = [
  {
    domain: "Verifiable AI",
    emoji: "🔐",
    name: "sealed-inference",
    slug: "sealed-inference",
    summary:
      "TEE-attested private inference with a verified attestation badge in the UI.",
    highlight: "Attestation actually shown + verified",
  },
  {
    domain: "Verifiable AI",
    emoji: "🔮",
    name: "ai-oracle",
    slug: "ai-oracle",
    summary:
      "Attested off-chain AI answer → on-chain commitment. Foundational kit; prediction-market composes it.",
    highlight: "Composable — kits build on kits",
  },
  {
    domain: "Agent Infrastructure",
    emoji: "🧠",
    name: "agent-memory",
    slug: "agent-memory",
    summary:
      "Persistent, namespaced agent memory on 0G Storage. Lib-only core works on all 9 bases.",
    highlight: "Works across every template base",
  },
  {
    domain: "Agent Infrastructure",
    emoji: "⚙️",
    name: "durable-agent",
    slug: "durable-agent",
    summary:
      "Long-running, resumable agent loop on 0gkit-jobs. Survives restarts; step ledger + OTEL traces.",
    highlight: "Durable by design — survives restarts",
  },
  {
    domain: "Markets & Onchain Data",
    emoji: "📈",
    name: "prediction-market",
    slug: "prediction-market",
    summary: "Full-stack AI-resolved prediction market with on-chain anchored proofs.",
    highlight: "Flagship showcase — composes ai-oracle",
  },
  {
    domain: "Markets & Onchain Data",
    emoji: "📡",
    name: "live-feed",
    slug: "live-feed",
    summary: "Reorg-safe live event/social feed via 0gkit-indexer.",
    highlight: "Reorg-safe by default",
  },
  {
    domain: "Assets",
    emoji: "🖼️",
    name: "inft-studio",
    slug: "inft-studio",
    summary:
      "Intelligent-NFT mint + gallery: Storage metadata, typed contract via 0gkit-contracts, optional attested provenance.",
    highlight: "Typed contracts + generation provenance",
  },
  {
    domain: "DeFi — testnet / demo",
    emoji: "💹",
    name: "yield-intel",
    slug: "yield-intel",
    summary:
      "AI yield analysis + attested decision log. User executes manually. Testnet-default, prominently demo-labelled.",
    highlight: "Honest: analysis only, no auto-execution",
  },
];
