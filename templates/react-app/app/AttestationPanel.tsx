"use client";

import { useAttestation } from "@foundryprotocol/0gkit-react";
import type { SignedEnvelope } from "@foundryprotocol/0gkit-attestation";

// A real, pre-signed sample envelope (EIP-191 over the canonical keccak
// digest). Signed with the well-known Anvil test key #1 — its address is
// the `coordinator` below. Pure crypto: this panel needs no network/keys.
const SIGNED: SignedEnvelope = {
  envelope: {
    kind: "foundry/eval-result/v1",
    forge: "0x1111111111111111111111111111111111111111",
    scores: [0.91, 0.87, 0.95],
    baseline: 0.8,
    teeAttestation: "0xdeadbeef",
    coordinator: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    timestamp: 1767225600,
  },
  digest: "0x37ff4e31f1264e5b9abf14601bd455a3e9aea7e05428fc78d4c897c70b35ee7e",
  signature:
    "0xf2f99dd2f2dd394646ef8e61c5dfb229c43707e5ee68467de1f0e80e4d443a66351a082324ee00e03e6133a3d4c3e9f2fae4100a09d98f281695948264f3cfbd1c",
};
const EXPECTED_SIGNER = SIGNED.envelope.coordinator;

export function AttestationPanel() {
  const at = useAttestation();

  function verifyGood() {
    void at.verify(SIGNED, EXPECTED_SIGNER).catch(() => {});
  }

  function verifyTampered() {
    const tampered: SignedEnvelope = {
      ...SIGNED,
      envelope: { ...SIGNED.envelope, baseline: 0.99 },
    };
    void at.verify(tampered, EXPECTED_SIGNER).catch(() => {});
  }

  return (
    <section>
      <h2>Verify a TEE attestation — useAttestation</h2>
      <p className="muted">
        Pure local crypto — no network, no keys. Tampering flips <code>ok</code> to
        false (verify never throws).
      </p>
      <p>
        <button onClick={verifyGood} disabled={at.loading}>
          Verify valid
        </button>{" "}
        <button onClick={verifyTampered} disabled={at.loading}>
          Verify tampered
        </button>{" "}
        {at.data && (
          <button onClick={at.reset} disabled={at.loading}>
            reset
          </button>
        )}
      </p>
      {at.data && (
        <pre className={at.data.ok ? "ok" : "error"}>
          {`ok     : ${at.data.ok}\n` +
            `digest : ${at.data.checks.digest}\n` +
            `signer : ${at.data.checks.signer}\n` +
            `signer : ${at.data.signer}`}
        </pre>
      )}
      {at.error && (
        <p className="error" role="alert">
          {at.error.message}
        </p>
      )}
    </section>
  );
}
