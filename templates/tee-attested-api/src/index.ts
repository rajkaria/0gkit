/**
 * tee-attested-api — Hono server where every response is TEE-attested.
 *
 * Access logs ship as OTel spans (one per request, with `http.*` attributes)
 * via `@foundryprotocol/0gkit-observability`. If you set
 * `OTEL_EXPORTER_OTLP_ENDPOINT`, spans flow to that collector (Honeycomb,
 * Datadog, Vercel OTel, Grafana Cloud, etc.). Without it, the runtime is
 * silent on stdout for access lines — pull a real exporter for production.
 *
 * Attestation source: the production server fetches the latest signed
 * envelope from your enclave's attestation endpoint (the 0G Compute provider
 * or a sidecar service). This template wires `fixtureAttestation` — a real
 * round-trip-verifiable envelope signed with a public test key — so the
 * binary starts even without a real provider. Replace `getAttestation` with
 * your actual fetch before deploying anywhere real.
 */
import { serve } from "@hono/node-server";
import { Compute } from "@foundryprotocol/0gkit-compute";
import { fromEnv } from "@foundryprotocol/0gkit-wallet";
import { ZeroGError } from "@foundryprotocol/0gkit-core";
import { instrument0g } from "@foundryprotocol/0gkit-observability";
import { buildApp } from "./app.js";

async function main(): Promise<void> {
  // Wire OpenTelemetry FIRST so the access-log spans + every 0gkit primitive
  // call are captured from the very first request.
  await instrument0g({
    serviceName: "tee-attested-api",
    exporter: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
      ? {
          kind: "otlp",
          endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
          headers: process.env.OTEL_EXPORTER_OTLP_HEADERS
            ? Object.fromEntries(
                process.env.OTEL_EXPORTER_OTLP_HEADERS.split(",").map(
                  (kv) => kv.split("=").map((s) => s.trim()) as [string, string]
                )
              )
            : undefined,
        }
      : { kind: "noop" },
  });

  const signer = await fromEnv();
  const network = (process.env.ZEROG_NETWORK ?? "galileo") as "galileo" | "aristotle";
  const compute = new Compute({ network, signer });

  // STUB attestation source. Replace with your provider's real envelope feed.
  const { fixtureAttestation } =
    await import("@foundryprotocol/0gkit-testing/fixtures");
  let cachedAttestation: unknown = await fixtureAttestation();
  setInterval(async () => {
    try {
      cachedAttestation = await fixtureAttestation({ timestamp: Date.now() });
    } catch (e) {
      // A refresh failure here isn't tied to any specific request — stderr is
      // the right place. In-band access is observed through OTel spans.
      console.error("attestation refresh failed:", e);
    }
  }, 60 * 1000);

  const app = buildApp({
    compute,
    getAttestation: async () => cachedAttestation,
  });

  const port = Number(process.env.PORT ?? 8787);
  serve({ fetch: app.fetch, port });
  console.log(`tee-attested-api listening on http://localhost:${port}`);
  console.log(`  Every response carries an X-0G-Attestation header.`);
  console.log(`  Access logs ship as OTel spans (one per request).`);
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    console.log(
      `  Tip: set OTEL_EXPORTER_OTLP_ENDPOINT to ship spans to your collector.`
    );
  }
  console.log(`  (Attestation source is a FIXTURE — replace before production.)`);
}

main().catch((err: unknown) => {
  if (err instanceof ZeroGError) {
    console.error(`\n${err.name}: ${err.message}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
