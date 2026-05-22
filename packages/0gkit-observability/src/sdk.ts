import { ZeroGError } from "@foundryprotocol/0gkit-core";
import type { InstrumentConfig } from "./instrument.js";

/**
 * Best-effort OTel SDK auto-setup. If the caller asks for `kind: "noop"` (or
 * doesn't pass an exporter at all), this is a no-op so apps that bring their
 * own SDK never load ours.
 *
 * The SDK peers (`@opentelemetry/sdk-node`,
 * `@opentelemetry/exporter-trace-otlp-http`) are lazy-imported via computed
 * specifiers so they stay out of the static dependency graph (and out of any
 * bundler tree that doesn't actually use them).
 */
export async function setupSdk(config: InstrumentConfig): Promise<void> {
  const exporter = config.exporter;
  if (!exporter || exporter.kind === "noop") return;

  try {
    const { NodeSDK } = (await import(
      ["@opentelemetry", "sdk-node"].join("/")
    )) as { NodeSDK: new (cfg: Record<string, unknown>) => { start(): void } };

    let traceExporter: unknown = undefined;
    if (exporter.kind === "console") {
      const { ConsoleSpanExporter } = (await import(
        ["@opentelemetry", "sdk-trace-base"].join("/")
      )) as { ConsoleSpanExporter: new () => unknown };
      traceExporter = new ConsoleSpanExporter();
    } else if (exporter.kind === "otlp") {
      const { OTLPTraceExporter } = (await import(
        ["@opentelemetry", "exporter-trace-otlp-http"].join("/")
      )) as {
        OTLPTraceExporter: new (opts: {
          url?: string;
          headers?: Record<string, string>;
        }) => unknown;
      };
      traceExporter = new OTLPTraceExporter({
        url: exporter.endpoint,
        headers: exporter.headers,
      });
    }
    const sdk = new NodeSDK({
      serviceName: config.serviceName ?? "0gkit-app",
      traceExporter,
    });
    sdk.start();
  } catch (err) {
    throw new ZeroGError(
      "OBSERVABILITY_EXPORTER_FAILED",
      `failed to start OTel SDK: ${(err as Error).message}`,
      `Install the SDK peers: \`pnpm add @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http\`. If you already have an OTel SDK configured, pass \`mode: "attach"\` to instrument0g().`
    );
  }
}
