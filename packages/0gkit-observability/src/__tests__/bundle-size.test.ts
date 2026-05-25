import { describe, expect, it } from "vitest";
import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUDGET_BYTES = 20 * 1024;

describe("bundle size", () => {
  it(`public entry bundles to <= ${BUDGET_BYTES} B gzipped`, async () => {
    const entry = resolve(__dirname, "../index.ts");
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      format: "esm",
      target: "es2022",
      platform: "node",
      write: false,
      // Peers are externalised — users provide them.
      external: [
        "@opentelemetry/api",
        "@opentelemetry/sdk-node",
        "@opentelemetry/sdk-trace-base",
        "@opentelemetry/exporter-trace-otlp-http",
        "@foundryprotocol/0gkit-core",
        // Real primitives are dynamic-imported via computed specifier; mark
        // them external so esbuild treats them as resolve-at-runtime instead
        // of attempting to resolve from the test's pnpm tree.
        "@foundryprotocol/0gkit-storage",
        "@foundryprotocol/0gkit-compute",
        "@foundryprotocol/0gkit-da",
        "@foundryprotocol/0gkit-attestation",
      ],
      minify: true,
      treeShaking: true,
    });
    const output = result.outputFiles[0];
    if (!output) throw new Error("esbuild produced no output");
    const text = output.text;
    const gz = gzipSync(Buffer.from(text, "utf8")).length;
    // Surface the measured size on failure so we can tune the budget.
    expect(
      gz,
      `bundle gzip size: ${gz} B (budget ${BUDGET_BYTES} B); raw ${text.length} B`
    ).toBeLessThanOrEqual(BUDGET_BYTES);
  });
});
