"use client";
import { useSwitchChain } from "wagmi";
import type { Chain } from "viem";

export interface UseSwitchNetworkResult {
  switchNetwork: (chainId: number) => Promise<Chain>;
  isPending: boolean;
  error: Error | null;
}

export function useSwitchNetwork(): UseSwitchNetworkResult {
  const { switchChainAsync, isPending, error } = useSwitchChain();
  return {
    switchNetwork: (chainId: number) => switchChainAsync({ chainId }),
    isPending,
    error,
  };
}
