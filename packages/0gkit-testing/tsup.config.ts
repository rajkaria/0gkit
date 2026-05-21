import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    matchers: "src/matchers/index.ts",
    mocks: "src/mocks/index.ts",
    fixtures: "src/fixtures/index.ts",
  },
  format: ["esm"],
  dts: true,
  splitting: false,
  clean: true,
  treeshake: true,
  sourcemap: true,
  target: "es2022",
  external: [
    "viem",
    "vitest",
    "@foundryprotocol/0gkit-core",
    "@foundryprotocol/0gkit-devnet",
    "@foundryprotocol/0gkit-attestation",
  ],
});
