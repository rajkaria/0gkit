"use client";
import { useMemo } from "react";
import {
  useAccount,
  useDisconnect,
  useSignMessage,
  useSignTypedData,
  useSendTransaction,
} from "wagmi";
import type { Signer } from "@foundryprotocol/0gkit-core";
import { adaptWagmi } from "./wagmi-signer.js";

export interface UseWalletResult {
  address: `0x${string}` | undefined;
  isConnected: boolean;
  signer: Signer | null;
  disconnect: () => void;
}

export function useWallet(): UseWalletResult {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { signTypedDataAsync } = useSignTypedData();
  const { sendTransactionAsync } = useSendTransaction();
  const { disconnect } = useDisconnect();

  const signer = useMemo(
    () =>
      adaptWagmi({
        address,
        signMessageAsync: (args) => signMessageAsync(args),
        signTypedDataAsync: (args) =>
          signTypedDataAsync(args as never) as Promise<`0x${string}`>,
        sendTransactionAsync: (tx) => sendTransactionAsync(tx as never),
      }),
    [address, signMessageAsync, signTypedDataAsync, sendTransactionAsync]
  );

  return { address, isConnected, signer, disconnect };
}
