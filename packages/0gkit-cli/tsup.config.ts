import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/cli.ts" },
  format: ["esm"],
  dts: false,
  splitting: false,
  clean: true,
  treeshake: true,
  sourcemap: true,
  target: "es2022",
  banner: { js: "#!/usr/bin/env node" },
  external: [
    "@foundryprotocol/0gkit-core",
    "@foundryprotocol/0gkit-chain",
    "@foundryprotocol/0gkit-storage",
    "@foundryprotocol/0gkit-compute",
    "@foundryprotocol/0gkit-da",
    "@foundryprotocol/0gkit-attestation",
    "@foundryprotocol/0gkit-devnet",
    "@foundryprotocol/0gkit-contracts",
    "@foundryprotocol/0gkit-contracts/codegen",
    "commander",
    "viem",
  ],
});
