import type { Context, Next } from "hono";

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

export function withAccessLog(log: (m: string) => void) {
  return async (c: Context, next: Next) => {
    const start = Date.now();
    await next();
    const dur = Date.now() - start;
    log(`${c.req.method} ${c.req.path} ${c.res.status} ${dur}ms`);
  };
}
