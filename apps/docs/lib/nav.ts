export interface NavLink {
  title: string;
  href: string;
}

export interface NavSection {
  title: string;
  links: NavLink[];
}

/**
 * The single source of truth for the sidebar. Order and grouping mirror the
 * documentation structure; every href maps 1:1 to an app route.
 */
export const NAV: NavSection[] = [
  {
    title: "Overview",
    links: [
      { title: "Introduction", href: "/" },
      { title: "Getting started", href: "/getting-started" },
      { title: "create-0gkit-app", href: "/getting-started/create-0gkit-app" },
      { title: "Concepts", href: "/concepts" },
    ],
  },
  {
    title: "Packages",
    links: [
      { title: "Overview", href: "/packages" },
      { title: "@foundryprotocol/0gkit-core", href: "/packages/core" },
      { title: "@foundryprotocol/0gkit-chain", href: "/packages/chain" },
      { title: "@foundryprotocol/0gkit-storage", href: "/packages/storage" },
      { title: "@foundryprotocol/0gkit-compute", href: "/packages/compute" },
      { title: "@foundryprotocol/0gkit-da", href: "/packages/da" },
      {
        title: "@foundryprotocol/0gkit-attestation",
        href: "/packages/attestation",
      },
      { title: "@foundryprotocol/0gkit-wallet", href: "/packages/wallet" },
      {
        title: "@foundryprotocol/0gkit-wallet-react",
        href: "/packages/wallet-react",
      },
      { title: "@foundryprotocol/0gkit-cli", href: "/packages/cli" },
      { title: "@foundryprotocol/0gkit-jobs", href: "/packages/jobs" },
      {
        title: "@foundryprotocol/0gkit-observability",
        href: "/packages/0gkit-observability",
      },
      {
        title: "@foundryprotocol/0gkit-contracts",
        href: "/packages/0gkit-contracts",
      },
      {
        title: "@foundryprotocol/0gkit-indexer",
        href: "/packages/0gkit-indexer",
      },
      {
        title: "@foundryprotocol/0gkit-testing",
        href: "/packages/0gkit-testing",
      },
      {
        title: "@foundryprotocol/0gkit-devnet",
        href: "/packages/0gkit-devnet",
      },
      { title: "@foundryprotocol/0gkit-mcp", href: "/packages/mcp" },
      { title: "@foundryprotocol/0gkit-react", href: "/packages/react" },
    ],
  },
  {
    title: "Cookbook",
    links: [
      { title: "Overview", href: "/cookbook" },
      { title: "Chat app", href: "/cookbook/chat-app" },
      { title: "AI agent", href: "/cookbook/ai-agent" },
      { title: "NFT minter", href: "/cookbook/nft-minter" },
    ],
  },
  {
    title: "Guides",
    links: [
      { title: "CLI reference", href: "/cli" },
      { title: "MCP guide", href: "/mcp" },
      { title: "React guide", href: "/react" },
      { title: "Durable jobs", href: "/concepts/durable-jobs" },
      { title: "Observability", href: "/concepts/observability" },
      { title: "Templates", href: "/templates" },
      { title: "Error codes", href: "/errors" },
      { title: "Troubleshooting & FAQ", href: "/troubleshooting" },
    ],
  },
];
