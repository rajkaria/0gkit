import { mnemonicToAccount } from "viem/accounts";
import type { Signer } from "@foundryprotocol/0gkit-core";

/**
 * The standard "anvil dev" mnemonic, used by 0gkit-devnet for its pre-funded
 * accounts. `testWallet({ index: 0 })` returns a Signer that matches anvil's
 * account 0 — so tests against the local devnet have gas immediately, no
 * faucet round-trip required.
 */
export const TEST_MNEMONIC =
  "test test test test test test test test test test test junk";

export interface TestWalletOptions {
  /** HD index from the dev mnemonic (default 0). 0gkit-devnet derives 10 accounts (0–9). */
  index?: number;
  /** Override the mnemonic — rare; mostly for cross-network parity tests. */
  mnemonic?: string;
}

/**
 * Build a deterministic `Signer` from an HD mnemonic. Implements the full
 * `0gkit-core.Signer` interface (address, signMessage, signTypedData,
 * sendTransaction) backed by viem's `mnemonicToAccount`.
 *
 * The returned signer exposes `privateKey`, so primitives that haven't yet
 * migrated to the wallet-client path (storage / compute) keep working.
 */
export function testWallet(opts: TestWalletOptions = {}): Signer {
  const index = opts.index ?? 0;
  const mnemonic = opts.mnemonic ?? TEST_MNEMONIC;
  const account = mnemonicToAccount(mnemonic, { addressIndex: index });
  const hdKey = account.getHdKey();
  if (!hdKey.privateKey) {
    throw new Error(`testWallet: failed to derive private key at index ${index}`);
  }
  const privateKey = ("0x" +
    Array.from(hdKey.privateKey)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")) as `0x${string}`;

  return {
    address: account.address,
    privateKey,
    source: "test-wallet",
    async signMessage(message) {
      return account.signMessage({ message: message as never });
    },
    async signTypedData(args) {
      return account.signTypedData(args as never);
    },
    async sendTransaction(_tx) {
      throw new Error(
        "testWallet.sendTransaction is not implemented — use mockStorageClient / mockComputeClient / mockDAClient for primitives, or wire the signer to setupLocalDevnet's wallet client for end-to-end tests."
      );
    },
  };
}
