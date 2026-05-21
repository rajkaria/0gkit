import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    codegen: "src/codegen/index.ts",
  },
  format: ["esm"],
  dts: true,
  splitting: false,
  clean: true,
  treeshake: true,
  sourcemap: true,
  target: "es2022",
  external: ["viem", "@foundryprotocol/0gkit-core", "node:fs/promises", "node:path"],
});
