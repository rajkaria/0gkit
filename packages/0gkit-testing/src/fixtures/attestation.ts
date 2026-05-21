import type { Hex } from "viem";

/**
 * NOT for any environment other than tests. This is a publicly-documented
 * test key — DO NOT use it to sign real attestations. Address:
 * 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (anvil dev account 0).
 */
export const FIXTURE_ATTESTATION_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;

export const FIXTURE_ATTESTATION_SIGNER =
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`;

/**
 * The minimal envelope shape — matches `AttestationEnvelope` from
 * `@foundryprotocol/0gkit-attestation` without forcing this package to
 * statically import attestation at the top level (boundary cleanliness +
 * install-weight win).
 */
export interface FixtureEnvelopeOptions {
  forge?: `0x${string}`;
  scores?: number[];
  baseline?: number;
  teeAttestation?: Hex;
  daRef?: string;
  coordinator?: `0x${string}`;
  timestamp?: number;
}

export interface FixtureSignedEnvelope {
  envelope: {
    kind: "foundry/eval-result/v1";
    forge: `0x${string}`;
    scores: number[];
    baseline: number;
    teeAttestation: Hex;
    daRef?: string;
    coordinator: `0x${string}`;
    timestamp: number;
  };
  digest: Hex;
  signature: Hex;
  signer: `0x${string}`;
}

/**
 * Build a signed attestation that round-trips through
 * `0gkit-attestation.verifyEnvelope`. The signature is real — we use the
 * fixture private key and viem's `sign` directly so consumers don't have to
 * install `0gkit-attestation` to get a usable test envelope.
 *
 * Importing this function dynamically pulls in viem signing helpers; we do
 * the same lazy import as `verifyEnvelope` does, keeping startup cost low.
 */
export async function fixtureAttestation(
  over: FixtureEnvelopeOptions = {}
): Promise<FixtureSignedEnvelope> {
  const { hashMessage } = await import("viem");
  const { sign } = await import("viem/accounts");
  const { digestJson } = await import("@foundryprotocol/0gkit-core");

  const envelope = {
    kind: "foundry/eval-result/v1" as const,
    forge: over.forge ?? FIXTURE_ATTESTATION_SIGNER,
    scores: over.scores ?? [0.9, 0.85, 0.95],
    baseline: over.baseline ?? 0.8,
    teeAttestation: over.teeAttestation ?? ("0xdeadbeef" as Hex),
    coordinator: over.coordinator ?? FIXTURE_ATTESTATION_SIGNER,
    timestamp: over.timestamp ?? 1716220800,
    ...(over.daRef !== undefined ? { daRef: over.daRef } : {}),
  };

  const digest = digestJson(envelope) as Hex;
  const signature = await sign({
    hash: hashMessage({ raw: digest }),
    privateKey: FIXTURE_ATTESTATION_PRIVATE_KEY,
    to: "hex",
  });

  return {
    envelope,
    digest,
    signature: signature as Hex,
    signer: FIXTURE_ATTESTATION_SIGNER,
  };
}
