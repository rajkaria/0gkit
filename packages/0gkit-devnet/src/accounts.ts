import { mnemonicToAccount } from "viem/accounts";
import { ZeroGError } from "@foundryprotocol/0gkit-core";

export const DEFAULT_DEV_MNEMONIC =
  "test test test test test test test test test test test junk";

export interface DevAccount {
  index: number;
  address: `0x${string}`;
  privateKey: `0x${string}`;
}

function toHexKey(bytes: Uint8Array): `0x${string}` {
  return ("0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")) as `0x${string}`;
}

export function deriveAccounts(
  opts: { count?: number; mnemonic?: string } = {}
): DevAccount[] {
  const count = opts.count ?? 10;
  const mnemonic = opts.mnemonic ?? DEFAULT_DEV_MNEMONIC;
  const out: DevAccount[] = [];
  for (let i = 0; i < count; i++) {
    const account = mnemonicToAccount(mnemonic, { addressIndex: i });
    const hdKey = account.getHdKey();
    if (!hdKey.privateKey) {
      throw new ZeroGError(
        "WALLET_NO_PRIVATE_KEY",
        `Failed to derive private key for index ${i}`,
        "The HD wallet for this mnemonic returned no private key for the requested index. Verify the mnemonic is a valid BIP-39 phrase and the index is reachable on the m/44'/60'/0'/0/i path."
      );
    }
    out.push({
      index: i,
      address: account.address,
      privateKey: toHexKey(hdKey.privateKey),
    });
  }
  return out;
}
