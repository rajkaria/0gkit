import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", cli: "src/cli.ts" },
  format: ["esm"],
  dts: true,
  splitting: false,
  clean: true,
  treeshake: true,
  sourcemap: true,
  target: "es2022",
  external: [
    "@foundryprotocol/0gkit-core",
    "@foundryprotocol/0gkit-chain",
    "@foundryprotocol/0gkit-storage",
    "@foundryprotocol/0gkit-compute",
    "@foundryprotocol/0gkit-da",
    "@foundryprotocol/0gkit-attestation",
    "@modelcontextprotocol/sdk",
    "viem",
    "zod",
  ],
});
