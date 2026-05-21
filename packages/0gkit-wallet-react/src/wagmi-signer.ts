import type {
  Signer,
  SignTypedDataArgs,
  SignableTx,
} from "@foundryprotocol/0gkit-core";

export interface WagmiAccountAdapter {
  address: `0x${string}` | undefined;
  signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>;
  signTypedDataAsync: (args: SignTypedDataArgs) => Promise<`0x${string}`>;
  sendTransactionAsync: (tx: SignableTx) => Promise<`0x${string}`>;
}

export function adaptWagmi(adapter: WagmiAccountAdapter): Signer | null {
  if (!adapter.address) return null;
  return {
    address: adapter.address,
    source: "wagmi",
    async signMessage(input) {
      let message: string;
      if (typeof input === "string") {
        message = input;
      } else if (ArrayBuffer.isView(input) || input instanceof ArrayBuffer) {
        message = new TextDecoder().decode(input as Uint8Array);
      } else if (typeof (input as { raw?: unknown }).raw === "string") {
        message = (input as { raw: string }).raw;
      } else {
        // raw is Uint8Array
        message = new TextDecoder().decode((input as { raw: Uint8Array }).raw);
      }
      return adapter.signMessageAsync({ message });
    },
    async signTypedData(args) {
      return adapter.signTypedDataAsync(args);
    },
    async sendTransaction(tx) {
      return adapter.sendTransactionAsync(tx);
    },
  };
}
