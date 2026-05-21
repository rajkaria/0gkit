import { describe, it, expect } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  parseEnvelope,
  digestEnvelope,
  signEnvelope,
  signEnvelopeWithSigner,
  recoverSigner,
  verifyEnvelope,
  reportEnvelope,
  type AttestationEnvelope,
} from "../attestation.js";
import { AttestationError } from "@foundryprotocol/0gkit-core";
import { fromPrivateKey } from "@foundryprotocol/0gkit-wallet";

function makeEnv(): AttestationEnvelope {
  return {
    kind: "foundry/eval-result/v1",
    forge: "0xdEAD000000000000000000000000000000000123",
    scores: [0.42, 0.18, 0.0],
    baseline: 0.5,
    teeAttestation: ("0x" + "ab".repeat(32)) as `0x${string}`,
    coordinator: "0xCAFE000000000000000000000000000000000456",
    timestamp: 1747200000,
  };
}

describe("parseEnvelope", () => {
  it("accepts a well-formed envelope", () => {
    expect(parseEnvelope(makeEnv()).kind).toBe("foundry/eval-result/v1");
  });
  it("throws AttestationError on a bad shape", () => {
    expect(() => parseEnvelope({ kind: "x" })).toThrowError(AttestationError);
  });

  it("rejects missing/invalid fields and non-finite numbers", () => {
    const e = {
      kind: "foundry/eval-result/v1",
      forge: "0xdEAD000000000000000000000000000000000123",
      scores: [0.1],
      baseline: 0.5,
      teeAttestation: "0x" + "ab".repeat(32),
      coordinator: "0xCAFE000000000000000000000000000000000456",
      timestamp: 1747200000,
    } as Record<string, unknown>;
    expect(() => parseEnvelope({ ...e, forge: 42 })).toThrowError(AttestationError);
    expect(() => parseEnvelope({ ...e, timestamp: Number.NaN })).toThrowError(
      AttestationError
    );
    expect(() => parseEnvelope({ ...e, baseline: Infinity })).toThrowError(
      AttestationError
    );
    expect(() => parseEnvelope({ ...e, scores: [Number.NaN] })).toThrowError(
      AttestationError
    );
    expect(() => parseEnvelope({ ...e, daRef: 7 })).toThrowError(AttestationError);
  });
});

describe("digestEnvelope", () => {
  it("is stable under key reorder, changes on mutation", () => {
    const e = makeEnv();
    expect(digestEnvelope(e)).toBe(digestEnvelope({ ...e } as AttestationEnvelope));
    expect(digestEnvelope(e)).not.toBe(digestEnvelope({ ...e, baseline: 0.99 }));
  });
});

describe("sign / recover / verify", () => {
  it("round-trips and verifies the expected signer", async () => {
    const pk = generatePrivateKey();
    const addr = privateKeyToAccount(pk).address;
    const signed = await signEnvelope(makeEnv(), pk);
    expect(signed.digest).toMatch(/^0x[0-9a-f]{64}$/);
    expect((await recoverSigner(signed)).toLowerCase()).toBe(addr.toLowerCase());

    const ok = await verifyEnvelope(signed, addr);
    expect(ok.ok).toBe(true);
    expect(ok.checks.digest).toBe(true);
    expect(ok.checks.signer).toBe(true);
    expect(ok.signer.toLowerCase()).toBe(addr.toLowerCase());
  });

  it("fails verify on signer mismatch", async () => {
    const signed = await signEnvelope(makeEnv(), generatePrivateKey());
    const other = privateKeyToAccount(generatePrivateKey()).address;
    const r = await verifyEnvelope(signed, other);
    expect(r.ok).toBe(false);
    expect(r.checks.signer).toBe(false);
  });

  it("fails verify on a tampered envelope (digest mismatch)", async () => {
    const signed = await signEnvelope(makeEnv(), generatePrivateKey());
    const tampered = {
      ...signed,
      envelope: { ...signed.envelope, baseline: 0.99 },
    };
    const r = await verifyEnvelope(
      tampered,
      privateKeyToAccount(generatePrivateKey()).address
    );
    expect(r.ok).toBe(false);
    expect(r.checks.digest).toBe(false);
  });

  it("fails verify on a malformed signature and never throws", async () => {
    const signed = await signEnvelope(makeEnv(), generatePrivateKey());
    const badSig = { ...signed, signature: "0xdeadbeef" as `0x${string}` };
    const r = await verifyEnvelope(
      badSig,
      privateKeyToAccount(generatePrivateKey()).address
    );
    expect(r.ok).toBe(false);
  });

  it("signEnvelope throws AttestationError on a malformed private key", async () => {
    await expect(signEnvelope(makeEnv(), "0x1234")).rejects.toMatchObject({
      code: "ATTESTATION",
    });
  });
});

describe("reportEnvelope", () => {
  it("renders a human-readable multi-line summary", async () => {
    const signed = await signEnvelope(makeEnv(), generatePrivateKey());
    const txt = reportEnvelope(signed);
    expect(txt).toContain("foundry/eval-result/v1");
    expect(txt).toContain(signed.digest);
    expect(txt).toContain("scores");
  });

  it("renders the daRef line when present", async () => {
    const signed = await signEnvelope(
      { ...makeEnv(), daRef: "0g-da:blob_9" },
      generatePrivateKey()
    );
    expect(reportEnvelope(signed)).toContain("0g-da:blob_9");
  });
});

describe("signEnvelopeWithSigner", () => {
  it("round-trips with verifyEnvelope using a fromPrivateKey signer", async () => {
    const pk = generatePrivateKey();
    const addr = privateKeyToAccount(pk).address;
    const signer = await fromPrivateKey(pk);

    const signed = await signEnvelopeWithSigner(makeEnv(), signer);
    expect(signed.digest).toMatch(/^0x[0-9a-f]{64}$/);
    expect(signed.signature).toMatch(/^0x[0-9a-f]+$/);

    const result = await verifyEnvelope(signed, addr);
    expect(result.ok).toBe(true);
    expect(result.checks.digest).toBe(true);
    expect(result.checks.signer).toBe(true);
    expect(result.signer.toLowerCase()).toBe(addr.toLowerCase());
  });

  it("produces identical digest to signEnvelope for the same key", async () => {
    const pk = generatePrivateKey();
    const signer = await fromPrivateKey(pk);
    const envelope = makeEnv();

    const withKey = await signEnvelope(envelope, pk);
    const withSigner = await signEnvelopeWithSigner(envelope, signer);

    expect(withSigner.digest).toBe(withKey.digest);
    expect(withSigner.signature).toBe(withKey.signature);
  });
});
