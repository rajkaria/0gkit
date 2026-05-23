/**
 * JSON-LD structured data so Google can render rich results — including the
 * install command directly in SERP snippets — and link the npm package, docs,
 * GitHub repo, and landing page as one entity.
 */

const SITE_URL = "https://0gkit.com";

const SOFTWARE_APPLICATION = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "0gkit",
  alternateName: ["create-0gkit-app", "@foundryprotocol/0gkit"],
  description:
    "The neutral, MIT-licensed TypeScript toolkit for the 0G network. Storage, compute, DA, attestation, and chain in one consistent surface. Install with `npm create 0gkit-app@latest`.",
  url: SITE_URL,
  applicationCategory: "DeveloperApplication",
  applicationSubCategory: "Web3 SDK",
  operatingSystem: "Cross-platform (Node.js >= 20.10)",
  softwareVersion: "1.0.0",
  programmingLanguage: ["TypeScript", "JavaScript"],
  downloadUrl: "https://www.npmjs.com/package/create-0gkit-app",
  installUrl: "https://www.npmjs.com/package/create-0gkit-app",
  codeRepository: "https://github.com/rajkaria/0gkit",
  license: "https://opensource.org/licenses/MIT",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  author: {
    "@type": "Organization",
    name: "Foundry Protocol",
    url: "https://foundryprotocol.xyz",
  },
  publisher: {
    "@type": "Organization",
    name: "Foundry Protocol",
    url: "https://foundryprotocol.xyz",
  },
  aggregateRating: undefined,
};

const ORGANIZATION = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "0gkit",
  url: SITE_URL,
  logo: `${SITE_URL}/icon.svg`,
  sameAs: [
    "https://github.com/rajkaria/0gkit",
    "https://www.npmjs.com/org/foundryprotocol",
    "https://docs.0gkit.com",
  ],
};

const WEBSITE = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "0gkit",
  url: SITE_URL,
  potentialAction: {
    "@type": "SearchAction",
    target: `https://docs.0gkit.com/?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

const FAQ = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How do I install 0gkit?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Run `npm create 0gkit-app@latest my-app`. The scaffolder picks a template, writes a network-aware `.env.example`, installs dependencies, and runs `git init`. From there it's `cd my-app && npm run dev`. Or install individual primitives like `npm i @foundryprotocol/0gkit-storage` if you already have an app.",
      },
    },
    {
      "@type": "Question",
      name: "What is 0gkit?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "0gkit is the neutral, MIT-licensed TypeScript toolkit for the 0G network. It gives you small, composable packages for every 0G capability — Storage, Compute (inference), Data Availability, TEE Attestation, and the native chain — plus a language-agnostic `0g` CLI, an MCP server for AI agents, and React hooks.",
      },
    },
    {
      "@type": "Question",
      name: "Is 0gkit official?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "0gkit is a community-built toolkit published under the `@foundryprotocol/0gkit-*` npm scope. It wraps the official 0G SDKs without hiding them — every primitive exposes a `.raw()` escape hatch back to the underlying SDK. The code is protocol-neutral and MIT-licensed.",
      },
    },
    {
      "@type": "Question",
      name: "Can I use 0gkit with the raw 0G SDKs?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Every 0gkit primitive exposes a `.raw()` method that returns the underlying official SDK instance, so you can drop down to the raw API at any time. The toolkit is designed as a help, not a cage — you are never blocked.",
      },
    },
    {
      "@type": "Question",
      name: "What templates does create-0gkit-app ship with?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Nine templates: storage-app, inference-app, attestation-verify, mcp-agent, react-app, chat, ai-agent, tee-attested-api, and nft-with-storage. Pick one with `--template <name>` or interactively at the prompt.",
      },
    },
  ],
};

export function StructuredData() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SOFTWARE_APPLICATION) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ) }}
      />
    </>
  );
}
