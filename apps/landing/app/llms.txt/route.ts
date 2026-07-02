// 0gkit.com/llms.txt — the llms.txt (https://llmstxt.org) entry point for the
// project's primary domain. Keeps a concise, curated overview here and points
// agents at the full, auto-generated docs index on docs.0gkit.com.

export const dynamic = "force-static";

const BODY = `# 0Gkit

> The neutral, MIT-licensed TypeScript toolkit for the 0G network — Storage, Compute, Data Availability, Attestation, and Chain behind one consistent API, plus a \`0g\` CLI, an MCP server for agents, React hooks, and drop-in feature Kits. Every package is versioned independently on npm under the \`@foundryprotocol/0gkit-*\` scope. Every write returns a uniform \`Receipt\`; every failure is a typed \`ZeroGError\` with a \`.code\`, \`.hint\`, and \`.helpUrl\`.

This file follows the llms.txt convention so AI agents can discover and read the project. The full, always-current documentation index lives on the docs domain.

## Documentation

- [Documentation home](https://docs.0gkit.com/): Full guide to every package, the CLI, MCP, React hooks, and Kits.
- [Docs llms.txt](https://docs.0gkit.com/llms.txt): Machine-readable index of every documentation page.
- [Docs llms-full.txt](https://docs.0gkit.com/llms-full.txt): Every documentation page concatenated into one text file.
- [Getting started](https://docs.0gkit.com/getting-started): Scaffold an app with \`create-0gkit-app\` or install packages directly.
- [CLI reference](https://docs.0gkit.com/cli): The \`0g\` binary — \`dev\`, \`test\`, \`add\`, \`contracts\`, \`estimate\`, \`mcp init\`, and more.
- [MCP guide](https://docs.0gkit.com/mcp): Expose every 0G primitive to agents as \`og_*\` tools.
- [React guide](https://docs.0gkit.com/react): \`useUpload\`, \`useInference\`, \`useEvent\`, \`useLogs\`.
- [Error codes](https://docs.0gkit.com/errors): The full \`ZeroGError\` taxonomy with remediation.

## Kits

- [Kits overview](https://0gkit.com/kits): Drop-in, upgradeable, multi-framework feature kits — \`0g add <kit>\`.
- [Kit catalog & docs](https://docs.0gkit.com/kits): sealed-inference, ai-oracle, agent-memory, durable-agent, prediction-market, live-feed, inft-studio, yield-intel.
- [Build & publish a kit](https://docs.0gkit.com/kits/authoring): Author your own kit.

## Source

- [GitHub repository](https://github.com/rajkaria/0gkit): MIT-licensed monorepo.
- [npm packages](https://www.npmjs.com/search?q=%40foundryprotocol%2F0gkit): The \`@foundryprotocol/0gkit-*\` scope.
- [Playground](https://playground.0gkit.com): Try 0gkit in the browser.
`;

export function GET() {
  return new Response(BODY, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
