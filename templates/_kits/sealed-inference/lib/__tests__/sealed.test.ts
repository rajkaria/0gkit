/**
 * Unit tests for the sealed-inference portable core.
 *
 * Uses pure in-memory mocks — NO network, NO real 0gkit packages.
 * Run via:
 *   ./packages/0gkit-kits/node_modules/.bin/vitest run --root templates/_kits/sealed-inference
 *
 * TDD: tests were written BEFORE the implementation.
 */

import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { sealedInfer, type InferenceClient, type Attestor } from "../sealed.js";

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

/**
 * A simple mock attestor that uses an HMAC for sign/verify.
 * Structurally mimics the real Attestor without any 0gkit dep.
 *
 * sign:   HMAC-SHA256(JSON.stringify(receipt), secret) → { digest, signature }
 * verify: recompute HMAC, compare to signed.digest, check expectedSigner
 */
function makeHmacAttestor(signerAddress: string, secret = "test-secret"): Attestor {
  function hmac(obj: unknown): string {
    return (
      "0x" + createHmac("sha256", secret).update(JSON.stringify(obj)).digest("hex")
    );
  }

  return {
    async sign(receipt: unknown) {
      const digest = hmac(receipt);
      return { digest, signature: digest }; // signature == digest for this test mock
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

/** A mock attestor whose verify always throws. */
function makeThrowingAttestor(): Attestor {
  return {
    async sign(_receipt: unknown) {
      return { digest: "0xdeadbeef", signature: "0xsignature" };
    },
    async verify(_receipt: unknown, _signed: unknown, _expectedSigner: string) {
      throw new Error("verify exploded");
    },
  };
}

const SIGNER = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

// ---------------------------------------------------------------------------
// sealedInfer — core contract
// ---------------------------------------------------------------------------

describe("sealedInfer", () => {
  it("returns { text, receipt, attestation, verified } shape", async () => {
    const attestor = makeHmacAttestor(SIGNER);
    const result = await sealedInfer(
      { infer: mockInfer("Hello world"), attestor },
      "Say hello",
      SIGNER
    );

    expect(typeof result.text).toBe("string");
    expect(typeof result.receipt).toBe("object");
    expect(typeof result.attestation).toBe("object");
    expect(typeof result.verified).toBe("boolean");
  });

  it("text equals the output from the inference client", async () => {
    const attestor = makeHmacAttestor(SIGNER);
    const result = await sealedInfer(
      { infer: mockInfer("The sky is blue"), attestor },
      "What color is the sky?",
      SIGNER
    );

    expect(result.text).toBe("The sky is blue");
  });

  it("verified = true when attestor.verify returns ok:true", async () => {
    const attestor = makeHmacAttestor(SIGNER);
    const result = await sealedInfer(
      { infer: mockInfer("42"), attestor },
      "What is the answer?",
      SIGNER
    );

    expect(result.verified).toBe(true);
  });

  it("verified = false when attestor.verify returns ok:false (wrong signer)", async () => {
    const attestor = makeHmacAttestor(SIGNER);
    const wrongSigner = "0x0000000000000000000000000000000000000001";
    const result = await sealedInfer(
      { infer: mockInfer("42"), attestor },
      "What is the answer?",
      wrongSigner // different from what the attestor was built with
    );

    expect(result.verified).toBe(false);
  });

  it("verified = false when attestor.verify throws (never throws to caller)", async () => {
    const throwingAttestor = makeThrowingAttestor();
    let threw = false;
    let result: Awaited<ReturnType<typeof sealedInfer>> | undefined;

    try {
      result = await sealedInfer(
        { infer: mockInfer("output"), attestor: throwingAttestor },
        "prompt",
        SIGNER
      );
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).toBeDefined();
    expect(result!.verified).toBe(false);
  });

  it("attestation.digest and attestation.signature come from attestor.sign", async () => {
    const attestor = makeHmacAttestor(SIGNER);
    const result = await sealedInfer(
      { infer: mockInfer("some output"), attestor },
      "some prompt",
      SIGNER
    );

    // digest and signature must be hex strings (non-empty)
    expect(result.attestation.digest).toMatch(/^0x[0-9a-f]+$/);
    expect(result.attestation.signature).toMatch(/^0x[0-9a-f]+$/);
  });

  it("receipt contains prompt and text", async () => {
    const attestor = makeHmacAttestor(SIGNER);
    const result = await sealedInfer(
      { infer: mockInfer("Paris"), attestor },
      "Capital of France?",
      SIGNER
    );

    const receipt = result.receipt as Record<string, unknown>;
    expect(receipt.prompt).toBe("Capital of France?");
    expect(receipt.text).toBe("Paris");
    expect(typeof receipt.ts).toBe("number");
  });

  it("round-trip: verify(result.receipt, result.attestation, SIGNER) = ok:true", async () => {
    const attestor = makeHmacAttestor(SIGNER);
    const result = await sealedInfer(
      { infer: mockInfer("42"), attestor },
      "What is the answer?",
      SIGNER
    );

    const { ok } = await attestor.verify(result.receipt, result.attestation, SIGNER);
    expect(ok).toBe(true);
  });

  it("round-trip with tampered receipt: verify returns ok:false", async () => {
    const attestor = makeHmacAttestor(SIGNER);
    const result = await sealedInfer(
      { infer: mockInfer("42"), attestor },
      "What is the answer?",
      SIGNER
    );

    // Tamper with the receipt
    const tampered = {
      ...(result.receipt as Record<string, unknown>),
      text: "TAMPERED",
    };
    const { ok } = await attestor.verify(tampered, result.attestation, SIGNER);
    expect(ok).toBe(false);
  });

  it("passes model option to the inference client", async () => {
    let capturedModel: string | undefined;
    const capturingInfer: InferenceClient = {
      async infer(args) {
        capturedModel = args.model;
        return { output: "ok" };
      },
    };
    const attestor = makeHmacAttestor(SIGNER);

    await sealedInfer(
      { infer: capturingInfer, attestor, model: "custom-model" },
      "prompt",
      SIGNER
    );

    expect(capturedModel).toBe("custom-model");
  });
});
