// packages/0gkit-react/src/IndexerProvider.tsx
import React, { createContext, useContext, type ReactNode } from "react";
import type { Indexer } from "@foundryprotocol/0gkit-indexer";

const Ctx = createContext<Indexer | null>(null);

export interface ZeroGIndexerProviderProps {
  indexer: Indexer;
  children: ReactNode;
}

export const ZeroGIndexerProvider: React.FC<ZeroGIndexerProviderProps> = ({
  indexer,
  children,
}) => <Ctx.Provider value={indexer}>{children}</Ctx.Provider>;

export function useIndexer(): Indexer {
  const i = useContext(Ctx);
  if (!i) {
    throw new Error(
      "useIndexer / useEvent / useLogs must be used inside <ZeroGIndexerProvider>."
    );
  }
  return i;
}
