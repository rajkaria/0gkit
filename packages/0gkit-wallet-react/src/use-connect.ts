"use client";
import { useConnect as useWagmiConnect, type Connector } from "wagmi";

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
      if (!c) throw new Error(`No connector found for "${connectorId}".`);
      return connectAsync({ connector: c });
    },
    connectors,
    isPending,
    error,
    reset,
  };
}
