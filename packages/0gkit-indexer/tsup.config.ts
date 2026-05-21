import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "cursors/sqlite": "src/cursors/sqlite.ts",
    "cursors/redis": "src/cursors/redis.ts",
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
    "@foundryprotocol/0gkit-core",
    "@foundryprotocol/0gkit-contracts",
    "better-sqlite3",
    "ioredis",
  ],
});
