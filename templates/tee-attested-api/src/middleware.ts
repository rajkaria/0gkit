import { trace, type Tracer } from "@opentelemetry/api";
import type { Context, Next } from "hono";

const TRACER_NAME = "tee-attested-api";

export interface AttestationProvider {
  getAttestation(): Promise<unknown>;
}

/**
 * Hono middleware that attaches a serialized attestation envelope to every
 * response as the X-0G-Attestation header. Consumers verify with
 * `verifyEnvelope` from `@foundryprotocol/0gkit-attestation`.
 */
export function withAttestation(provider: AttestationProvider) {
  return async (c: Context, next: Next) => {
    await next();
    try {
      const attestation = await provider.getAttestation();
      c.res.headers.set("X-0G-Attestation", JSON.stringify(attestation));
    } catch (e) {
      c.res.headers.set("X-0G-Attestation-Error", (e as Error).message);
    }
  };
}

/**
 * Hono middleware that wraps each request in an OTel span and records
 * standard `http.*` attributes plus a duration. Replaces the SP8-era
 * `console.log` access log (resolves SP8 D26 hand-off). When the app has
 * called `instrument0g({...})` and configured an exporter, these spans ship
 * to whichever backend the user configured (Honeycomb / Datadog / Vercel
 * OTel / Tempo / etc.).
 *
 * Pass `{ tracer }` to share a tracer instance across middlewares (or to
 * inject a test tracer); otherwise we fetch the default tracer per request
 * (cheap — the OTel API caches tracers by name).
 */
export function withAccessLog(opts: { tracer?: Tracer } = {}) {
  return async (c: Context, next: Next) => {
    const tracer = opts.tracer ?? trace.getTracer(TRACER_NAME);
    await tracer.startActiveSpan(
      `${c.req.method} ${c.req.path}`,
      async (span) => {
        const start = Date.now();
        span.setAttribute("http.method", c.req.method);
        span.setAttribute("http.route", c.req.path);
        try {
          await next();
          span.setAttribute("http.status_code", c.res.status);
          span.setAttribute("http.duration_ms", Date.now() - start);
        } finally {
          span.end();
        }
      }
    );
  };
}
