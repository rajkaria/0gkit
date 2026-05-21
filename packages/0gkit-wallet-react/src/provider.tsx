"use client";
import { ReactNode, useMemo } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { defineChain } from "viem";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export type ZeroGNetwork = "galileo" | "aristotle" | "local";
export type ZeroGConnectorId = "injected" | "walletConnect";

export interface ZeroGWalletConfig {
  network: ZeroGNetwork;
  connectors?: ZeroGConnectorId[];
  walletConnectProjectId?: string;
}

const CHAINS = {
  galileo: defineChain({
    id: 16602,
    name: "0G Galileo",
    nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
    rpcUrls: { default: { http: ["https://evmrpc-testnet.0g.ai"] } },
  }),
  aristotle: defineChain({
    id: 16661,
    name: "0G Aristotle",
    nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
    rpcUrls: { default: { http: ["https://evmrpc.0g.ai"] } },
  }),
  local: defineChain({
    id: 31337,
    name: "0G Local",
    nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
    rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  }),
} as const;

export function ZeroGWalletProvider(props: {
  config: ZeroGWalletConfig;
  children: ReactNode;
  queryClient?: QueryClient;
}) {
  const wagmiConfig = useMemo(() => {
    const chain = CHAINS[props.config.network];
    const wanted = props.config.connectors ?? ["injected"];
    const connectors = wanted.map((id) => {
      if (id === "injected") return injected();
      if (id === "walletConnect") {
        if (!props.config.walletConnectProjectId) {
          throw new Error(
            "ZeroGWalletProvider: walletConnect connector requires walletConnectProjectId."
          );
        }
        return walletConnect({ projectId: props.config.walletConnectProjectId });
      }
      throw new Error(`ZeroGWalletProvider: unknown connector "${id}"`);
    });
    const rpcUrl = chain.rpcUrls.default.http[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transports: Record<number, any> = { [chain.id]: http(rpcUrl) };
    return createConfig({
      chains: [chain],
      connectors,
      // cast needed: computed key loses literal type information
      transports: transports as never,
    });
  }, [props.config]);

  const qc = useMemo(() => props.queryClient ?? new QueryClient(), [props.queryClient]);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>{props.children}</QueryClientProvider>
    </WagmiProvider>
  );
}
