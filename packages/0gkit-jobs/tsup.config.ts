import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "backends/memory": "src/backends/memory.ts",
    "backends/sqlite": "src/backends/sqlite.ts",
    "backends/redis": "src/backends/redis.ts",
  },
  format: ["esm"],
  dts: true,
  splitting: false,
  clean: true,
  treeshake: true,
  sourcemap: true,
  target: "es2022",
  external: ["@foundryprotocol/0gkit-core", "better-sqlite3", "ioredis", "zod"],
});
