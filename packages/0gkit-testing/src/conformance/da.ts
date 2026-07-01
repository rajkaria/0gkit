import type { SuiteResult, SuiteDeps } from "./index.js";

const PROBE_BYTES = new Uint8Array([1, 2, 3, 4]);

export async function daSuite(deps: SuiteDeps): Promise<SuiteResult> {
  const da = deps.makeDA();
  const { digest } = await da.publish(PROBE_BYTES);
  // Real mock signature: verify(digest, bytes) — not (bytes, digest)
  const verified = await da.verify(digest, PROBE_BYTES);
  return {
    name: "da",
    ok: verified,
    detail: verified
      ? `publish + verify round-tripped (digest ${digest.slice(0, 10)}…)`
      : `verify returned false after publish (digest ${digest.slice(0, 10)}…)`,
  };
}
