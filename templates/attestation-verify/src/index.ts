/**
 * attestation-verify — parse, sign, and verify a 0G TEE attestation envelope.
 *
 * 100% local crypto: no network calls, no funded key required. The demo
 * builds a sample attestation envelope, signs it with a well-known test key
 * (EIP-191 personal-sign over the canonical-JSON keccak digest), then:
 *   - parses the envelope back (shape validation),
 *   - recovers the signer from the signature,
 *   - verifies digest integrity AND signer identity,
 *   - and shows that tampering flips the result to ok:false.
 */
import { privateKeyToAccount } from "viem/accounts";
import {
  parseEnvelope,
  signEnvelope,
  recoverSigner,
  verifyEnvelope,
  reportEnvelope,
  type AttestationEnvelope,
} from "@foundryprotocol/0gkit-attestation";
import { ZeroGError } from "@foundryprotocol/0gkit-core";

// A well-known Anvil/Hardhat test key. NEVER use this for anything real.
const DEMO_PRIVATE_KEY =
  process.env.DEMO_PRIVATE_KEY ??
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

async function main(): Promise<void> {
  // The address that "the TEE coordinator" would have. We derive it from the
  // demo key so the expected-signer check is provably correct.
  const coordinator = privateKeyToAccount(DEMO_PRIVATE_KEY as `0x${string}`).address;

  const envelope: AttestationEnvelope = {
    kind: "foundry/eval-result/v1",
    forge: "0x1111111111111111111111111111111111111111",
    scores: [0.91, 0.87, 0.95],
    baseline: 0.8,
    teeAttestation: "0xdeadbeef",
    coordinator,
    timestamp: Math.floor(Date.UTC(2026, 0, 1) / 1000),
  };

  // 1. Sign (EIP-191 over the canonical digest).
  const signed = await signEnvelope(envelope, DEMO_PRIVATE_KEY);
  console.log(reportEnvelope(signed));
  console.log();

  // 2. Parse the envelope back — shape validation, throws on a bad shape.
  const parsed = parseEnvelope(signed.envelope);
  console.log(`Parsed envelope kind: ${parsed.kind}`);

  // 3. Recover the signer purely from digest + signature.
  const recovered = await recoverSigner(signed);
  console.log(`Recovered signer    : ${recovered}`);
  console.log(`Expected coordinator: ${coordinator}`);

  // 4. Full verify: digest integrity AND signer identity.
  const good = await verifyEnvelope(signed, coordinator);
  console.log(
    `\nverify(valid)   ok=${good.ok} ` +
      `digest=${good.checks.digest} signer=${good.checks.signer}`
  );

  // 5. Tamper with the envelope — verify must now fail (it never throws).
  const tampered = {
    ...signed,
    envelope: { ...signed.envelope, baseline: 0.99 },
  };
  const bad = await verifyEnvelope(tampered, coordinator);
  console.log(
    `verify(tampered) ok=${bad.ok} ` +
      `digest=${bad.checks.digest} signer=${bad.checks.signer}`
  );

  if (!good.ok || bad.ok) {
    console.error("\nUnexpected verification outcome.");
    process.exit(1);
  }
  console.log("\nAttestation verification works as expected.");
}

main().catch((err: unknown) => {
  if (err instanceof ZeroGError) {
    console.error(`\n${err.name}: ${err.message}`);
    console.error(`Hint: ${err.hint}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
