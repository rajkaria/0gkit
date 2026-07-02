// Type-only import — erased at compile time, so it never reaches a bundler.
// The runtime values are loaded lazily inside fromKMS() (see below) because
// @aws-sdk/client-kms is an OPTIONAL peer dependency: a top-level static import
// would force every bundler (Turbopack/webpack/Vite) to resolve it at build
// time, breaking apps that only use fromPrivateKey/fromEnv and never install
// the AWS SDK (e.g. the `chat` template's browser bundle).
import type { KMSClient } from "@aws-sdk/client-kms";
import { hashMessage, hashTypedData, keccak256, recoverAddress, type Hex } from "viem";
import {
  ConfigError,
  ZeroGError,
  type Signer,
  type SignTypedDataArgs,
  type SignableTx,
} from "@foundryprotocol/0gkit-core";
import type { FromKMSOptions } from "./types.js";

export async function fromKMS(opts: FromKMSOptions): Promise<Signer> {
  // Load the optional AWS SDK lazily through a runtime-assembled specifier so
  // bundlers can't statically resolve it at build time — the import only runs
  // when someone actually calls fromKMS().
  let kms: typeof import("@aws-sdk/client-kms");
  let client: KMSClient;
  try {
    const kmsSpecifier = ["@aws-sdk", "client-kms"].join("/");
    kms = (await import(kmsSpecifier)) as typeof import("@aws-sdk/client-kms");
    client = new kms.KMSClient({ region: opts.region ?? process.env.AWS_REGION });
  } catch (err) {
    throw new ConfigError(
      `Failed to load @aws-sdk/client-kms or construct KMSClient: ${err instanceof Error ? err.message : String(err)}.`,
      "Install @aws-sdk/client-kms and provide AWS credentials (env, profile, or IAM role)."
    );
  }

  let publicKeyDer: Uint8Array;
  try {
    const r = await client.send(new kms.GetPublicKeyCommand({ KeyId: opts.keyId }));
    if (!r.PublicKey) {
      throw new ZeroGError(
        "WALLET_KMS_PUBKEY_FAILED",
        "KMS GetPublicKey returned no PublicKey",
        "Verify the KMS key id and that the KMS service is reachable."
      );
    }
    publicKeyDer = r.PublicKey;
  } catch (err) {
    throw new ConfigError(
      `KMS GetPublicKey(${opts.keyId}) failed: ${err instanceof Error ? err.message : String(err)}.`,
      "Verify the KMS key id, the IAM principal can kms:GetPublicKey, and the key spec is ECC_SECG_P256K1.",
      "WALLET_KMS_PUBKEY_FAILED"
    );
  }

  const address = addressFromSpki(publicKeyDer);

  async function kmsSign(hash: Hex): Promise<Hex> {
    let der: Uint8Array;
    try {
      const r = await client.send(
        new kms.SignCommand({
          KeyId: opts.keyId,
          Message: hexToBytes(hash),
          MessageType: kms.MessageType.DIGEST,
          SigningAlgorithm: kms.SigningAlgorithmSpec.ECDSA_SHA_256,
        })
      );
      if (!r.Signature) {
        throw new ZeroGError(
          "WALLET_KMS_SIGN_FAILED",
          "KMS Sign returned no Signature",
          "Confirm the IAM principal has kms:Sign and the KMS service is reachable."
        );
      }
      der = r.Signature;
    } catch (err) {
      throw new ConfigError(
        `KMS Sign failed: ${err instanceof Error ? err.message : String(err)}.`,
        "Confirm the IAM principal has kms:Sign and the key is enabled.",
        "WALLET_KMS_SIGN_FAILED"
      );
    }
    const { r, s } = decodeDerEcdsa(der);
    const sLowered = normaliseLowS(s);
    for (const v of [27n, 28n]) {
      const sig = encodeSignature(r, sLowered, v);
      const recovered = await recoverAddress({ hash, signature: sig });
      if (recovered.toLowerCase() === address.toLowerCase()) return sig;
    }
    throw new ConfigError(
      "KMS signature did not recover the expected address.",
      "This usually means the public key returned by KMS does not match the signing key — file a bug."
    );
  }

  return {
    address,
    source: "kms",
    async signMessage(input) {
      const hash =
        typeof input === "string"
          ? hashMessage(input)
          : input instanceof Uint8Array
            ? hashMessage({ raw: bytesToHex(input) })
            : hashMessage(input);
      return kmsSign(hash);
    },
    async signTypedData(args: SignTypedDataArgs) {
      const hash = hashTypedData(args as Parameters<typeof hashTypedData>[0]);
      return kmsSign(hash);
    },
    async sendTransaction(_tx: SignableTx): Promise<`0x${string}`> {
      throw new ConfigError(
        "sendTransaction is not implemented for KMS signers.",
        "Use the primitive's own write path (Storage.upload / Compute.inference / etc.) which builds the tx for you."
      );
    },
  };
}

const SPKI_HEADER_LEN = 23;

function addressFromSpki(spki: Uint8Array): `0x${string}` {
  if (spki.length !== SPKI_HEADER_LEN + 65) {
    throw new ConfigError(
      `KMS PublicKey has unexpected length ${spki.length} (expected ${SPKI_HEADER_LEN + 65}).`,
      "The KMS key is not an ECC_SECG_P256K1 (secp256k1) key. Create one with KeySpec=ECC_SECG_P256K1."
    );
  }
  const point = spki.slice(SPKI_HEADER_LEN);
  if (point[0] !== 0x04) {
    throw new ConfigError(
      "KMS PublicKey is not in uncompressed form.",
      "Re-create the KMS key as ECC_SECG_P256K1; uncompressed is the default."
    );
  }
  const xy = point.slice(1);
  const hash = keccak256(bytesToHex(xy));
  return `0x${hash.slice(-40)}` as `0x${string}`;
}

function decodeDerEcdsa(der: Uint8Array): { r: bigint; s: bigint } {
  if (der[0] !== 0x30) {
    throw new ZeroGError(
      "WALLET_BAD_DER_SIGNATURE",
      "Bad DER signature: missing SEQUENCE tag",
      "The signature returned by KMS is not a valid ASN.1 DER ECDSA signature. This usually means the KMS key spec is not ECC_SECG_P256K1; recreate the key with the correct spec."
    );
  }
  let i = 2;
  if (der[i] !== 0x02) {
    throw new ZeroGError(
      "WALLET_BAD_DER_SIGNATURE",
      "Bad DER signature (r): missing INTEGER tag",
      "The signature returned by KMS is not a valid ASN.1 DER ECDSA signature. This usually means the KMS key spec is not ECC_SECG_P256K1; recreate the key with the correct spec."
    );
  }
  const rLen = der[i + 1];
  const r = bytesToBigInt(der.slice(i + 2, i + 2 + rLen));
  i += 2 + rLen;
  if (der[i] !== 0x02) {
    throw new ZeroGError(
      "WALLET_BAD_DER_SIGNATURE",
      "Bad DER signature (s): missing INTEGER tag",
      "The signature returned by KMS is not a valid ASN.1 DER ECDSA signature. This usually means the KMS key spec is not ECC_SECG_P256K1; recreate the key with the correct spec."
    );
  }
  const sLen = der[i + 1];
  const s = bytesToBigInt(der.slice(i + 2, i + 2 + sLen));
  return { r, s };
}

const SECP_N = BigInt(
  "0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"
);

function normaliseLowS(s: bigint): bigint {
  return s > SECP_N / 2n ? SECP_N - s : s;
}

function encodeSignature(r: bigint, s: bigint, v: bigint): `0x${string}` {
  const rh = r.toString(16).padStart(64, "0");
  const sh = s.toString(16).padStart(64, "0");
  const vh = v.toString(16).padStart(2, "0");
  return `0x${rh}${sh}${vh}` as `0x${string}`;
}

function hexToBytes(hex: `0x${string}`): Uint8Array {
  const h = hex.slice(2);
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  let out = "0x";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out as `0x${string}`;
}

function bytesToBigInt(b: Uint8Array): bigint {
  let n = 0n;
  for (const x of b) n = (n << 8n) | BigInt(x);
  return n;
}
