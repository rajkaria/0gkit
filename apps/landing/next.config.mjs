import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
  },
  async redirects() {
    return [
      {
        source: "/errors",
        destination: "https://docs.0gkit.com/errors",
        permanent: true,
      },
      {
        source: "/errors/:code",
        destination: "https://docs.0gkit.com/errors/:code",
        permanent: true,
      },
    ];
  },
};

export default config;
