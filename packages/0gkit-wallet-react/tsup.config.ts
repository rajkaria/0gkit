import { defineConfig } from "tsup";
export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  dts: true,
  splitting: false,
  clean: true,
  treeshake: true,
  sourcemap: true,
  target: "es2022",
  external: [
    "react",
    "viem",
    "wagmi",
    "@tanstack/react-query",
    "@foundryprotocol/0gkit-core",
    "@foundryprotocol/0gkit-wallet",
  ],
});
