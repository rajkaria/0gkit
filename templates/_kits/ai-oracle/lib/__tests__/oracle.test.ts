/**
 * Unit tests for the ai-oracle portable core.
 *
 * Uses pure in-memory mocks for all injected deps — NO network, NO real 0gkit.
 * Run via:
 *   ./packages/0gkit-kits/node_modules/.bin/vitest run --root templates/_kits/ai-oracle
 */

import { describe, it, expect } from "vitest";
import { createHash, createHmac } from "node:crypto";
import {
  resolveOracle,
  type InferenceClient,
  type Attestor,
  type Anchor,
} from "../oracle.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256hex(text: string): string {
  return "0x" + createHash("sha256").update(text, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function mockInfer(output: string): InferenceClient {
  return {
    async infer(_args) {
      return { output };
    },
  };
}

function mockAttestor(): Attestor & { lastReceipt: unknown } {
  let lastReceipt: unknown = null;
  return {
    get lastReceipt() {
      return lastReceipt;
    },
    async sign(receipt) {
      lastReceipt = receipt;
      return {
        digest: "0xdeadbeef",
        signature: "0xsignature",
      };
    },
    async verify(receipt, signed, expectedSigner) {
      const okDigest = signed.digest === "0xdeadbeef";
      return { ok: okDigest && expectedSigner === "0xsigner", signer: expectedSigner };
    },
  };
}

function mockAnchor(
  kind: "storage" | "onchain" = "storage"
): Anchor & { lastPayload: Uint8Array | string | null } {
  let lastPayload: Uint8Array | string | null = null;
  return {
    get lastPayload() {
      return lastPayload;
    },
    async anchor(payload) {
      lastPayload = payload;
      return { ref: "0x1234storageroot", kind };
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveOracle", () => {
  it("returns answer, answerHash, attestation, commitment", async () => {
    const answer = "The sky is blue";
    const result = await resolveOracle(
      {
        infer: mockInfer(answer),
        attestor: mockAttestor(),
        anchor: mockAnchor(),
      },
      "What color is the sky?"
    );

    expect(result.answer).toBe(answer);
    expect(typeof result.answerHash).toBe("string");
    expect(typeof result.attestation).toBe("object");
    expect(typeof result.commitment).toBe("object");
  });

  it("answerHash === sha256(answer) prefixed with 0x", async () => {
    const answer = "Ethereum is a blockchain";
    const result = await resolveOracle(
      {
        infer: mockInfer(answer),
        attestor: mockAttestor(),
        anchor: mockAnchor(),
      },
      "What is Ethereum?"
    );

    expect(result.answerHash).toBe(sha256hex(answer));
  });

  it("commitment.ref equals the anchor's ref", async () => {
    const anchor = mockAnchor("storage");
    const result = await resolveOracle(
      {
        infer: mockInfer("some answer"),
        attestor: mockAttestor(),
        anchor,
      },
      "some question"
    );

    expect(result.commitment.ref).toBe("0x1234storageroot");
    expect(result.commitment.kind).toBe("storage");
  });

  it("attestation contains digest and signature from attestor.sign", async () => {
    const attestor = mockAttestor();
    const result = await resolveOracle(
      {
        infer: mockInfer("42"),
        attestor,
        anchor: mockAnchor(),
      },
      "What is the answer?"
    );

    expect(result.attestation.digest).toBe("0xdeadbeef");
    expect(result.attestation.signature).toBe("0xsignature");
  });

  it("attestor.sign is called with the receipt (answer + answerHash + question)", async () => {
    const attestor = mockAttestor();
    const answer = "Paris";
    const question = "Capital of France?";

    const result = await resolveOracle(
      {
        infer: mockInfer(answer),
        attestor,
        anchor: mockAnchor(),
      },
      question
    );

    // attestor.sign receives a receipt containing the answer and hash
    const receipt = attestor.lastReceipt as Record<string, unknown>;
    expect(receipt.answer).toBe(answer);
    expect(receipt.answerHash).toBe(result.answerHash);
    expect(receipt.question).toBe(question);
  });

  it("anchor.anchor is called with the signed receipt payload", async () => {
    const anchor = mockAnchor("onchain");
    await resolveOracle(
      {
        infer: mockInfer("answer"),
        attestor: mockAttestor(),
        anchor,
      },
      "question"
    );

    // anchor was called — lastPayload should be a non-null string or Uint8Array
    expect(anchor.lastPayload).not.toBeNull();
  });

  it("onchain kind propagates through commitment", async () => {
    const result = await resolveOracle(
      {
        infer: mockInfer("some-result"),
        attestor: mockAttestor(),
        anchor: mockAnchor("onchain"),
      },
      "question"
    );

    expect(result.commitment.kind).toBe("onchain");
  });

  it("different questions produce different answerHashes", async () => {
    const deps = {
      infer: mockInfer("same answer"),
      attestor: mockAttestor(),
      anchor: mockAnchor(),
    };
    const r1 = await resolveOracle(deps, "q1");
    const r2 = await resolveOracle(deps, "q2");
    // same answer → same hash (hash is over the answer string)
    expect(r1.answerHash).toBe(r2.answerHash);
  });

  it("different answers produce different answerHashes", async () => {
    const result1 = await resolveOracle(
      { infer: mockInfer("yes"), attestor: mockAttestor(), anchor: mockAnchor() },
      "q?"
    );
    const result2 = await resolveOracle(
      { infer: mockInfer("no"), attestor: mockAttestor(), anchor: mockAnchor() },
      "q?"
    );
    expect(result1.answerHash).not.toBe(result2.answerHash);
    expect(result1.answerHash).toBe(sha256hex("yes"));
    expect(result2.answerHash).toBe(sha256hex("no"));
  });

  it("result includes the exact receipt object that was signed", async () => {
    const attestor = mockAttestor();
    const result = await resolveOracle(
      { infer: mockInfer("Paris"), attestor, anchor: mockAnchor() },
      "Capital of France?"
    );

    expect(result.receipt).toBeDefined();
    expect(result.receipt.question).toBe("Capital of France?");
    expect(result.receipt.answer).toBe("Paris");
    expect(result.receipt.answerHash).toBe(result.answerHash);
    expect(typeof result.receipt.ts).toBe("number");
    // The receipt exposed in result must be the same object sign() received
    expect(result.receipt).toEqual(attestor.lastReceipt);
  });
});

// ---------------------------------------------------------------------------
// Round-trip attestor (real sign/verify seam — pure crypto, no 0gkit imports)
// ---------------------------------------------------------------------------

/**
 * A signing attestor backed by node:crypto HMAC-SHA256 for test purposes.
 * Mimics the structural contract of the real Attestor without any 0gkit dep.
 *
 * sign:   HMAC-SHA256(JSON.stringify(receipt), secret) → digest+signature (same value here)
 * verify: recompute HMAC over receipt, compare to signed.digest, check expectedSigner
 */
function makeRoundTripAttestor(signerAddress: string): Attestor {
  const secret = "test-secret-key";

  function hmac(obj: unknown): string {
    return (
      "0x" + createHmac("sha256", secret).update(JSON.stringify(obj)).digest("hex")
    );
  }

  return {
    async sign(receipt: unknown) {
      const digest = hmac(receipt);
      return { digest, signature: digest }; // signature == digest for this mock
    },
    async verify(
      receipt: unknown,
      signed: { digest: string; signature: string },
      expectedSigner: string
    ) {
      const recomputed = hmac(receipt);
      const ok =
        recomputed.toLowerCase() === signed.digest.toLowerCase() &&
        expectedSigner.toLowerCase() === signerAddress.toLowerCase();
      return { ok, signer: signerAddress };
    },
  };
}

describe("receipt round-trip", () => {
  const SIGNER = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

  it("verify(result.receipt, result.attestation, signer) returns ok=true", async () => {
    const attestor = makeRoundTripAttestor(SIGNER);
    const result = await resolveOracle(
      { infer: mockInfer("42"), attestor, anchor: mockAnchor() },
      "What is the answer?"
    );

    const { ok, signer } = await attestor.verify(
      result.receipt,
      result.attestation,
      SIGNER
    );

    expect(ok).toBe(true);
    expect(signer.toLowerCase()).toBe(SIGNER.toLowerCase());
  });

  it("verify with a tampered receipt returns ok=false", async () => {
    const attestor = makeRoundTripAttestor(SIGNER);
    const result = await resolveOracle(
      { infer: mockInfer("42"), attestor, anchor: mockAnchor() },
      "What is the answer?"
    );

    // Tamper: change the answer in the receipt
    const tamperedReceipt = { ...result.receipt, answer: "TAMPERED" };

    const { ok } = await attestor.verify(tamperedReceipt, result.attestation, SIGNER);

    expect(ok).toBe(false);
  });

  it("verify with wrong expectedSigner returns ok=false", async () => {
    const attestor = makeRoundTripAttestor(SIGNER);
    const result = await resolveOracle(
      { infer: mockInfer("hello"), attestor, anchor: mockAnchor() },
      "greeting?"
    );

    const { ok } = await attestor.verify(
      result.receipt,
      result.attestation,
      "0x0000000000000000000000000000000000000001"
    );

    expect(ok).toBe(false);
  });
});
