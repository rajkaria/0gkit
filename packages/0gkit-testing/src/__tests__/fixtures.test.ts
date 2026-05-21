import { describe, it, expect } from "vitest";
import { hashMessage, recoverMessageAddress } from "viem";
import { fixtureReceipt } from "../fixtures/receipt.js";
import {
  fixtureAttestation,
  FIXTURE_ATTESTATION_SIGNER,
} from "../fixtures/attestation.js";

describe("fixtureReceipt", () => {
  it("returns a Receipt-shaped object with stable defaults", () => {
    const r = fixtureReceipt();
    expect(r.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(r.blockNumber).toBe(100n);
    expect(r.latencyMs).toBe(5);
  });

  it("merges overrides", () => {
    const r = fixtureReceipt({ latencyMs: 999, blockNumber: 17n });
    expect(r.latencyMs).toBe(999);
    expect(r.blockNumber).toBe(17n);
    expect(r.txHash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("fixtureAttestation", () => {
  it("emits a signed envelope whose signature recovers to FIXTURE_ATTESTATION_SIGNER", async () => {
    const signed = await fixtureAttestation();
    // Verify via viem primitives only — the round-trip through
    // `verifyEnvelope` from `@foundryprotocol/0gkit-attestation` is covered
    // by the migrated test in that package (keeps this package's dependency
    // graph acyclic for turbo).
    const recovered = await recoverMessageAddress({
      message: { raw: signed.digest },
      signature: signed.signature,
    });
    expect(recovered.toLowerCase()).toBe(FIXTURE_ATTESTATION_SIGNER.toLowerCase());
    // hashMessage import keeps us honest that the EIP-191 helper resolves at
    // runtime — guards against a future viem export rename.
    expect(typeof hashMessage).toBe("function");
  });

  it("applies overrides on the envelope", async () => {
    const signed = await fixtureAttestation({
      scores: [0.1, 0.2],
      baseline: 0.5,
      daRef: "ar://demo",
    });
    expect(signed.envelope.scores).toEqual([0.1, 0.2]);
    expect(signed.envelope.baseline).toBe(0.5);
    expect(signed.envelope.daRef).toBe("ar://demo");
  });

  it("two calls with the same inputs produce the same digest + signature", async () => {
    const a = await fixtureAttestation({ timestamp: 1000 });
    const b = await fixtureAttestation({ timestamp: 1000 });
    expect(a.digest).toBe(b.digest);
    expect(a.signature).toBe(b.signature);
  });
});
