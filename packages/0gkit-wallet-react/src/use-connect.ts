"use client";
import { useConnect as useWagmiConnect, type Connector } from "wagmi";
import { ZeroGError } from "@foundryprotocol/0gkit-core";

export interface UseConnectResult {
  connect: (connectorId?: string) => Promise<unknown>;
  connectors: readonly Connector[];
  isPending: boolean;
  error: Error | null;
  reset: () => void;
}

export function useConnect(): UseConnectResult {
  const { connectAsync, connectors, isPending, error, reset } = useWagmiConnect();
  return {
    connect: (connectorId?: string) => {
      const c = connectorId
        ? connectors.find((x) => x.id === connectorId || x.type === connectorId)
        : connectors[0];
      if (!c) {
        throw new ZeroGError(
          "WALLET_NO_CONNECTOR",
          `No connector found for "${connectorId}".`,
          `Wrap your app in <ZeroGWalletProvider> with a connector that matches "${connectorId}" (e.g. "injected", "walletConnect"), or call connect() with no argument to use the first available connector.`
        );
      }
      return connectAsync({ connector: c });
    },
    connectors,
    isPending,
    error,
    reset,
  };
}
