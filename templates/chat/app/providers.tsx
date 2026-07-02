"use client";
import { useEffect, useMemo } from "react";
import { Indexer } from "@foundryprotocol/0gkit-indexer";
import { ZeroGIndexerProvider } from "@foundryprotocol/0gkit-react";
import { config } from "../0g.config";

export function Providers({ children }: { children: React.ReactNode }) {
  const env = config.client(process.env as Record<string, string | undefined>);
  const network = env.NEXT_PUBLIC_ZEROG_NETWORK;

  const indexer = useMemo(
    () => new Indexer({ network, pollIntervalMs: 2000 }),
    [network]
  );

  useEffect(() => {
    indexer.start().catch((e) => console.error("indexer start failed:", e));
    return () => {
      indexer.stop().catch(() => undefined);
    };
  }, [indexer]);

  return <ZeroGIndexerProvider indexer={indexer}>{children}</ZeroGIndexerProvider>;
}
