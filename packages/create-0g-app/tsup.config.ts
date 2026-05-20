import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/bin.ts"],
  format: ["esm"],
  dts: { entry: "src/index.ts" },
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  treeshake: true,
  sourcemap: true,
  target: "es2022",
});
