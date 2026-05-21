import { expect } from "vitest";

interface MatchResult {
  pass: boolean;
  message: () => string;
}

/**
 * Lazily imports `0gkit-attestation` so this matcher pulls in the verifier
 * only when it's actually used. Keeps the testing package light for consumers
 * who never call this matcher.
 *
 * `expectedSigner` is optional — when omitted, we still verify the digest
 * integrity and that the signature recovers to *some* address. Pass an
 * `expectedSigner` to bind the assertion to a known identity (use
 * `FIXTURE_ATTESTATION_SIGNER` for fixture-signed envelopes).
 */
export async function toBeValidAttestation(
  received: unknown,
  expectedSigner?: string
): Promise<MatchResult> {
  if (!received || typeof received !== "object") {
    return {
      pass: false,
      message: () =>
        `Expected a SignedEnvelope object, received ${typeof received}. ` +
        `A SignedEnvelope is { envelope, digest, signature }.`,
    };
  }
  const env = received as { envelope?: unknown; digest?: unknown; signature?: unknown };
  if (
    !env.envelope ||
    typeof env.digest !== "string" ||
    typeof env.signature !== "string"
  ) {
    return {
      pass: false,
      message: () =>
        `Expected { envelope, digest, signature }, got keys=${Object.keys(env).join(", ")}.`,
    };
  }
  const specifier = ["@foundryprotocol", "0gkit-attestation"].join("/");
  const att = (await import(/* @vite-ignore */ specifier)) as {
    digestEnvelope: (e: unknown) => string;
    recoverSigner: (s: unknown) => Promise<string>;
  };
  const recomputed = att.digestEnvelope(env.envelope);
  const digestOk = recomputed.toLowerCase() === (env.digest as string).toLowerCase();
  if (!digestOk) {
    return {
      pass: false,
      message: () =>
        `Attestation digest mismatch — envelope was tampered after signing. ` +
        `Recomputed ${recomputed}, signed ${env.digest}.`,
    };
  }
  let signer: string;
  try {
    signer = await att.recoverSigner(received as never);
  } catch (err) {
    return {
      pass: false,
      message: () =>
        `Signature recovery failed: ${(err as Error).message}. Signature must be a 65-byte hex string from EIP-191 personal-sign.`,
    };
  }
  if (expectedSigner && signer.toLowerCase() !== expectedSigner.toLowerCase()) {
    return {
      pass: false,
      message: () =>
        `Attestation signer mismatch. expected=${expectedSigner} got=${signer}.`,
    };
  }
  return {
    pass: true,
    message: () => `Expected attestation NOT to verify, but it did (signer=${signer}).`,
  };
}

expect.extend({ toBeValidAttestation });
