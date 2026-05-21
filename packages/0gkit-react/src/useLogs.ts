// packages/0gkit-react/src/useLogs.ts
import { useEffect, useState } from "react";
import { useIndexer } from "./IndexerProvider.js";
import type { DecodedEvent, SubscribeOptions } from "@foundryprotocol/0gkit-indexer";

export interface UseLogsOptions {
  contract: SubscribeOptions["contract"];
  event: string;
  fromBlock: bigint;
  toBlock?: bigint;
}

export interface UseLogsResult {
  logs: DecodedEvent[];
  isLoading: boolean;
  error: Error | null;
}

/**
 * One-shot historical query. Useful for "show me all events of type X in the
 * given block range." Live subscriptions belong in `useEvent`.
 */
export function useLogs(opts: UseLogsOptions): UseLogsResult {
  const indexer = useIndexer();
  const [logs, setLogs] = useState<DecodedEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const collected: DecodedEvent[] = [];
        const { id } = await indexer.subscribe({
          contract: opts.contract,
          event: opts.event,
          fromBlock: opts.fromBlock,
          onEvent: (e) => {
            if (opts.toBlock !== undefined && e.blockNumber > opts.toBlock) return;
            collected.push(e);
          },
        });
        await indexer.start();
        await new Promise((r) => setTimeout(r, 50));
        await indexer.stop();
        if (mounted) {
          setLogs(collected);
          setIsLoading(false);
        }
        void id;
      } catch (e) {
        if (mounted) {
          setError(e as Error);
          setIsLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indexer]);

  return { logs, isLoading, error };
}
