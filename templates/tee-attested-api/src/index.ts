/**
 * tee-attested-api — Hono server where every response is TEE-attested.
 *
 * SP11 (`@foundryprotocol/0gkit-observability`) hand-off: today we use
 * plain `console.log` for the access log and rely on the X-0G-Attestation
 * response header. When SP11 lands, swap `log` for the structured logger
 * + tracing emitter. The attestation header stays.
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
import { buildApp } from "./app.js";

async function main(): Promise<void> {
  const signer = await fromEnv();
  const network = (process.env.ZEROG_NETWORK ?? "galileo") as "galileo" | "aristotle";
  const compute = new Compute({ network, signer });

  // STUB attestation source. Replace with your provider's real envelope feed.
  const { fixtureAttestation } = await import(
    "@foundryprotocol/0gkit-testing/fixtures"
  );
  let cachedAttestation: unknown = await fixtureAttestation();
  setInterval(async () => {
    try {
      cachedAttestation = await fixtureAttestation({ timestamp: Date.now() });
    } catch (e) {
      console.error("attestation refresh failed:", e);
    }
  }, 60 * 1000);

  const app = buildApp({
    compute,
    getAttestation: async () => cachedAttestation,
    log: (m) => console.log(m),
  });

  const port = Number(process.env.PORT ?? 8787);
  serve({ fetch: app.fetch, port });
  console.log(`tee-attested-api listening on http://localhost:${port}`);
  console.log(`  Every response carries an X-0G-Attestation header.`);
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
