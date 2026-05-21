import { privateKeyToAccount } from "viem/accounts";
import { ConfigError, type Signer, type SignableTx } from "@foundryprotocol/0gkit-core";

function normalizeHex(pk: string): `0x${string}` {
  const trimmed = pk.startsWith("0x") ? pk.slice(2) : pk;
  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new ConfigError(
      "Invalid private key.",
      "Pass a 32-byte hex private key (with or without 0x), e.g. `cast wallet new` output."
    );
  }
  return `0x${trimmed.toLowerCase()}`;
}

export function buildLocalSigner(pk: string, source: Signer["source"]): Signer {
  const normalized = normalizeHex(pk);
  const account = privateKeyToAccount(normalized);
  return {
    address: account.address,
    privateKey: normalized,
    source,
    async signMessage(input) {
      if (typeof input === "string") return account.signMessage({ message: input });
      if (input instanceof Uint8Array) {
        return account.signMessage({ message: { raw: bytesToHex(input) } });
      }
      return account.signMessage({ message: input });
    },
    async signTypedData(args) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return account.signTypedData(args as any);
    },
    async sendTransaction(_tx: SignableTx) {
      throw new ConfigError(
        "sendTransaction is not implemented on a bare LocalAccountSigner.",
        "Use the primitive's own write path (Storage.upload / Compute.inference / etc.) which builds the tx for you."
      );
    },
  };
}

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  let out = "0x";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out as `0x${string}`;
}
