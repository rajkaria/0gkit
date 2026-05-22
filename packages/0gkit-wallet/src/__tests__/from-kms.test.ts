import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { KMSClient, GetPublicKeyCommand, SignCommand } from "@aws-sdk/client-kms";
import { recoverMessageAddress, recoverTypedDataAddress } from "viem";
import { privateKeyToAddress } from "viem/accounts";
import { fromKMS } from "../from-kms.js";
import { secp256k1 } from "@noble/curves/secp256k1";

const PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const ADDRESS = privateKeyToAddress(PK);

function spkiDerFromPrivateKey(pk: string): Uint8Array {
  const SPKI_PREFIX = new Uint8Array([
    0x30, 0x56, 0x30, 0x10, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06,
    0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a, 0x03, 0x42, 0x00,
  ]);
  const point = secp256k1.getPublicKey(pk.slice(2), false); // uncompressed, 65 bytes
  const out = new Uint8Array(SPKI_PREFIX.length + point.length);
  out.set(SPKI_PREFIX, 0);
  out.set(point, SPKI_PREFIX.length);
  return out;
}

function trimZeros(b: Uint8Array): Uint8Array {
  let i = 0;
  while (i < b.length - 1 && b[i] === 0 && b[i + 1] < 0x80) i++;
  let out = b.slice(i);
  if (out[0] >= 0x80) out = new Uint8Array([0, ...out]);
  return out;
}

async function kmsSignDer(hashHex: `0x${string}`): Promise<Uint8Array> {
  const sigCompact = secp256k1.sign(hashHex.slice(2), PK.slice(2), { lowS: true });
  const compact = sigCompact.toCompactRawBytes();
  const r = trimZeros(compact.slice(0, 32));
  const s = trimZeros(compact.slice(32, 64));
  const seq = new Uint8Array(2 + 2 + r.length + 2 + s.length);
  let i = 0;
  seq[i++] = 0x30;
  seq[i++] = 2 + r.length + 2 + s.length;
  seq[i++] = 0x02;
  seq[i++] = r.length;
  seq.set(r, i);
  i += r.length;
  seq[i++] = 0x02;
  seq[i++] = s.length;
  seq.set(s, i);
  return seq;
}

const kmsMock = mockClient(KMSClient);

beforeEach(() => {
  kmsMock.reset();
  kmsMock.on(GetPublicKeyCommand).resolves({ PublicKey: spkiDerFromPrivateKey(PK) });
  kmsMock.on(SignCommand).callsFake(async (input: any) => ({
    Signature: await kmsSignDer(
      `0x${Buffer.from(input.Message as Uint8Array).toString("hex")}` as `0x${string}`
    ),
  }));
});

describe("fromKMS (mocked)", () => {
  it("derives the correct address from KMS GetPublicKey", async () => {
    const s = await fromKMS({ keyId: "arn:aws:kms:us-east-1:000:key/abc" });
    expect(s.address.toLowerCase()).toBe(ADDRESS.toLowerCase());
    expect(s.source).toBe("kms");
    expect(s.privateKey).toBeUndefined();
  });

  it("signMessage returns a signature that recovers the same address", async () => {
    const s = await fromKMS({ keyId: "arn:aws:kms:us-east-1:000:key/abc" });
    const sig = await s.signMessage("gm");
    const rec = await recoverMessageAddress({ message: "gm", signature: sig });
    expect(rec.toLowerCase()).toBe(s.address.toLowerCase());
  });

  it("signTypedData returns a recoverable signature", async () => {
    const s = await fromKMS({ keyId: "arn:aws:kms:us-east-1:000:key/abc" });
    const args = {
      domain: { name: "0gkit", version: "1", chainId: 16602 },
      types: { Mail: [{ name: "body", type: "string" }] },
      primaryType: "Mail" as const,
      message: { body: "hello" },
    };
    const sig = await s.signTypedData(args);
    const rec = await recoverTypedDataAddress({ ...args, signature: sig });
    expect(rec.toLowerCase()).toBe(s.address.toLowerCase());
  });

  it("propagates KMS errors as ConfigError", async () => {
    kmsMock.reset();
    kmsMock.on(GetPublicKeyCommand).rejects(new Error("AccessDeniedException"));
    await expect(fromKMS({ keyId: "arn:bad" })).rejects.toMatchObject({
      code: "WALLET_KMS_PUBKEY_FAILED",
    });
  });

  it("throws ConfigError when KMS returns SPKI with wrong length", async () => {
    kmsMock.reset();
    // Return a SPKI buffer that is too short (not 23 + 65 = 88 bytes)
    kmsMock.on(GetPublicKeyCommand).resolves({ PublicKey: new Uint8Array(10) });
    await expect(
      fromKMS({ keyId: "arn:aws:kms:us-east-1:000:key/bad-len" })
    ).rejects.toMatchObject({
      code: "CONFIG_INVALID_ARGUMENT",
    });
  });

  it("throws ConfigError when KMS SPKI point is not uncompressed (0x04)", async () => {
    kmsMock.reset();
    const SPKI_HEADER_LEN = 23;
    // Build a correctly-sized SPKI but with 0x02 (compressed prefix) instead of 0x04
    const badSpki = new Uint8Array(SPKI_HEADER_LEN + 65);
    badSpki[SPKI_HEADER_LEN] = 0x02; // compressed, not 0x04
    kmsMock.on(GetPublicKeyCommand).resolves({ PublicKey: badSpki });
    await expect(
      fromKMS({ keyId: "arn:aws:kms:us-east-1:000:key/compressed" })
    ).rejects.toMatchObject({
      code: "CONFIG_INVALID_ARGUMENT",
    });
  });

  it("sendTransaction throws ConfigError", async () => {
    const s = await fromKMS({ keyId: "arn:aws:kms:us-east-1:000:key/abc" });
    await expect(s.sendTransaction({})).rejects.toMatchObject({
      code: "CONFIG_INVALID_ARGUMENT",
    });
  });

  it("signMessage accepts a Uint8Array input", async () => {
    const s = await fromKMS({ keyId: "arn:aws:kms:us-east-1:000:key/abc" });
    const bytes = new TextEncoder().encode("gm");
    const sig = await s.signMessage(bytes);
    expect(sig).toMatch(/^0x[0-9a-f]{130}$/i);
  });

  it("signMessage accepts a { raw } object input", async () => {
    const s = await fromKMS({ keyId: "arn:aws:kms:us-east-1:000:key/abc" });
    const raw = "0xdeadbeef01020304" as `0x${string}`;
    const sig = await s.signMessage({ raw });
    expect(sig).toMatch(/^0x[0-9a-f]{130}$/i);
  });
});
