import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const stub = "./lib/browser-sdk-stub.ts";
// Pin the workspace root: the repo can be checked out alongside git
// worktrees that each carry a lockfile, which otherwise makes Next's
// root inference ambiguous (warns on every build).
const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@foundryprotocol/0gkit-react",
    "@foundryprotocol/0gkit-core",
    "@foundryprotocol/0gkit-storage",
    "@foundryprotocol/0gkit-compute",
    "@foundryprotocol/0gkit-attestation",
  ],
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
    // The Node-only 0G SDK peers are unusable in a browser; alias them to a
    // stub so the pure-client bundle stays clean. Live upload/infer then
    // surface a clear "needs a server/CLI" error; attestation verify and the
    // copy-code widget work fully client-side.
    resolveAlias: {
      "@0gfoundation/0g-storage-ts-sdk": stub,
      "@0gfoundation/0g-compute-ts-sdk": stub,
      "@0glabs/0g-serving-broker": stub,
    },
  },
};

export default config;
