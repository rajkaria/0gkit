import { describe, it, expect } from "vitest";
import "@foundryprotocol/0gkit-testing/matchers";
import {
  fixtureAttestation,
  FIXTURE_ATTESTATION_SIGNER,
} from "@foundryprotocol/0gkit-testing";
import { verifyEnvelope, recoverSigner } from "../attestation.js";

describe("@foundryprotocol/0gkit-testing — fixtureAttestation (attestation surface)", () => {
  it("produces an envelope that verifies with the canonical attestation API", async () => {
    const signed = await fixtureAttestation();
    const result = await verifyEnvelope(signed, FIXTURE_ATTESTATION_SIGNER);
    expect(result.ok).toBe(true);
  });

  it("recovers to the FIXTURE_ATTESTATION_SIGNER address", async () => {
    const signed = await fixtureAttestation();
    const signer = await recoverSigner(signed);
    expect(signer.toLowerCase()).toBe(FIXTURE_ATTESTATION_SIGNER.toLowerCase());
  });

  it("passes the toBeValidAttestation matcher", async () => {
    const signed = await fixtureAttestation();
    await expect(signed).toBeValidAttestation(FIXTURE_ATTESTATION_SIGNER);
  });
});
