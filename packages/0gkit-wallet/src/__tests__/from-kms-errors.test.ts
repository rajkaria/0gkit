import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { KMSClient, GetPublicKeyCommand, SignCommand } from "@aws-sdk/client-kms";
import { privateKeyToAddress } from "viem/accounts";
import { secp256k1 } from "@noble/curves/secp256k1";
import { fromKMS } from "../from-kms.js";

const PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const _ADDRESS = privateKeyToAddress(PK);

function spkiDerFromPrivateKey(pk: string): Uint8Array {
  const SPKI_PREFIX = new Uint8Array([
    0x30, 0x56, 0x30, 0x10, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06,
    0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a, 0x03, 0x42, 0x00,
  ]);
  const point = secp256k1.getPublicKey(pk.slice(2), false);
  const out = new Uint8Array(SPKI_PREFIX.length + point.length);
  out.set(SPKI_PREFIX, 0);
  out.set(point, SPKI_PREFIX.length);
  return out;
}

const kmsMock = mockClient(KMSClient);

beforeEach(() => {
  kmsMock.reset();
});

describe("fromKMS error codes", () => {
  it("throws WALLET_KMS_PUBKEY_FAILED when GetPublicKey returns no PublicKey", async () => {
    kmsMock.on(GetPublicKeyCommand).resolves({});
    try {
      await fromKMS({ keyId: "arn:aws:kms:us-east-1:000:key/nopub" });
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("WALLET_KMS_PUBKEY_FAILED");
      expect((e as { helpUrl?: string }).helpUrl).toBe(
        "https://0gkit.dev/errors/WALLET_KMS_PUBKEY_FAILED"
      );
      expect(e instanceof Error).toBe(true);
    }
  });

  it("throws WALLET_KMS_PUBKEY_FAILED when GetPublicKey rejects", async () => {
    kmsMock.on(GetPublicKeyCommand).rejects(new Error("AccessDenied"));
    try {
      await fromKMS({ keyId: "arn:aws:kms:us-east-1:000:key/denied" });
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("WALLET_KMS_PUBKEY_FAILED");
      expect((e as { helpUrl?: string }).helpUrl).toBe(
        "https://0gkit.dev/errors/WALLET_KMS_PUBKEY_FAILED"
      );
      expect(e instanceof Error).toBe(true);
    }
  });

  it("throws WALLET_KMS_SIGN_FAILED when Sign returns no Signature", async () => {
    kmsMock.on(GetPublicKeyCommand).resolves({ PublicKey: spkiDerFromPrivateKey(PK) });
    kmsMock.on(SignCommand).resolves({});
    const s = await fromKMS({ keyId: "arn:aws:kms:us-east-1:000:key/abc" });
    try {
      await s.signMessage("hello");
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("WALLET_KMS_SIGN_FAILED");
      expect((e as { helpUrl?: string }).helpUrl).toBe(
        "https://0gkit.dev/errors/WALLET_KMS_SIGN_FAILED"
      );
      expect(e instanceof Error).toBe(true);
    }
  });

  it("throws WALLET_KMS_SIGN_FAILED when Sign rejects", async () => {
    kmsMock.on(GetPublicKeyCommand).resolves({ PublicKey: spkiDerFromPrivateKey(PK) });
    kmsMock.on(SignCommand).rejects(new Error("kms:Sign denied"));
    const s = await fromKMS({ keyId: "arn:aws:kms:us-east-1:000:key/abc" });
    try {
      await s.signMessage("hello");
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("WALLET_KMS_SIGN_FAILED");
      expect((e as { helpUrl?: string }).helpUrl).toBe(
        "https://0gkit.dev/errors/WALLET_KMS_SIGN_FAILED"
      );
      expect(e instanceof Error).toBe(true);
    }
  });

  it("throws WALLET_BAD_DER_SIGNATURE when Sign returns malformed DER (no SEQUENCE)", async () => {
    kmsMock.on(GetPublicKeyCommand).resolves({ PublicKey: spkiDerFromPrivateKey(PK) });
    // 0x31 instead of 0x30 = bad SEQUENCE tag
    kmsMock.on(SignCommand).resolves({ Signature: new Uint8Array([0x31, 0x00]) });
    const s = await fromKMS({ keyId: "arn:aws:kms:us-east-1:000:key/abc" });
    try {
      await s.signMessage("hello");
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("WALLET_BAD_DER_SIGNATURE");
      expect((e as { helpUrl?: string }).helpUrl).toBe(
        "https://0gkit.dev/errors/WALLET_BAD_DER_SIGNATURE"
      );
      expect(e instanceof Error).toBe(true);
    }
  });

  it("throws WALLET_BAD_DER_SIGNATURE when Sign returns malformed DER (no INTEGER r)", async () => {
    kmsMock.on(GetPublicKeyCommand).resolves({ PublicKey: spkiDerFromPrivateKey(PK) });
    // 0x30 (SEQUENCE) + length byte + non-0x02 for r
    kmsMock
      .on(SignCommand)
      .resolves({ Signature: new Uint8Array([0x30, 0x04, 0x03, 0x00, 0x02, 0x00]) });
    const s = await fromKMS({ keyId: "arn:aws:kms:us-east-1:000:key/abc" });
    try {
      await s.signMessage("hello");
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("WALLET_BAD_DER_SIGNATURE");
      expect((e as { helpUrl?: string }).helpUrl).toBe(
        "https://0gkit.dev/errors/WALLET_BAD_DER_SIGNATURE"
      );
      expect(e instanceof Error).toBe(true);
    }
  });

  it("throws WALLET_BAD_DER_SIGNATURE when Sign returns malformed DER (no INTEGER s)", async () => {
    kmsMock.on(GetPublicKeyCommand).resolves({ PublicKey: spkiDerFromPrivateKey(PK) });
    // 0x30 + SEQ_LEN + 0x02 + r_len(1) + r(0x01) + non-0x02 for s
    kmsMock.on(SignCommand).resolves({
      Signature: new Uint8Array([0x30, 0x05, 0x02, 0x01, 0x01, 0x03, 0x00]),
    });
    const s = await fromKMS({ keyId: "arn:aws:kms:us-east-1:000:key/abc" });
    try {
      await s.signMessage("hello");
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("WALLET_BAD_DER_SIGNATURE");
      expect((e as { helpUrl?: string }).helpUrl).toBe(
        "https://0gkit.dev/errors/WALLET_BAD_DER_SIGNATURE"
      );
      expect(e instanceof Error).toBe(true);
    }
  });
});
