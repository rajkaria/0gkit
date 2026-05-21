// packages/0gkit-react/src/useEvent.ts
import { useEffect, useRef, useState } from "react";
import type { DecodedEvent, SubscribeOptions } from "@foundryprotocol/0gkit-indexer";
import { useIndexer } from "./IndexerProvider.js";

export interface UseEventOptions extends Omit<
  SubscribeOptions,
  "onEvent" | "onReorg"
> {}

export interface UseEventResult {
  events: DecodedEvent[];
  isLoading: boolean;
  error: Error | null;
}

export function useEvent(opts: UseEventOptions): UseEventResult {
  const indexer = useIndexer();
  const [events, setEvents] = useState<DecodedEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    let mounted = true;
    (async () => {
      try {
        await indexer.subscribe({
          ...opts,
          onEvent: (e) => {
            if (!mounted) return;
            setEvents((prev) => [...prev, e]);
          },
          onReorg: (rolled) => {
            if (!mounted) return;
            const dropBlocks = new Set(rolled.map((r) => r.blockNumber));
            setEvents((prev) => prev.filter((e) => !dropBlocks.has(e.blockNumber)));
          },
        });
        if (mounted) setIsLoading(false);
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
    // intentionally omit `opts` from deps — a stable subscription per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indexer]);

  return { events, isLoading, error };
}
