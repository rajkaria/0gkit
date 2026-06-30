/**
 * agent-memory — React hook
 *
 * Calls the /api/memory route handler to read and write agent memory.
 * Works with any React or Next.js app that has the react-app adapter applied.
 *
 * Usage:
 *   const { entries, remember, recall, isLoading, error } = useAgentMemory();
 */

"use client";

import { useState, useEffect, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types (duplicated from lib to keep the UI layer self-contained)
// ---------------------------------------------------------------------------

export interface MemoryEntry {
  key: string;
  value: string;
  ts: number;
}

export interface UseAgentMemoryResult {
  entries: MemoryEntry[];
  isLoading: boolean;
  error: string | null;
  /** Append a key→value pair to memory and refresh the list. */
  remember: (key: string, value: string) => Promise<void>;
  /** Query memory; updates `entries` with matching results. */
  recall: (query: string) => Promise<void>;
  /** Refresh the full entry list. */
  refresh: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAgentMemory(
  /** API route prefix — defaults to "/api/memory". */
  apiPath = "/api/memory"
): UseAgentMemoryResult {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(apiPath);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { entries?: MemoryEntry[]; error?: string };
      if (data.error) throw new Error(data.error);
      setEntries(data.entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [apiPath]);

  const recall = useCallback(
    async (query: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const url = query ? `${apiPath}?q=${encodeURIComponent(query)}` : apiPath;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { entries?: MemoryEntry[]; error?: string };
        if (data.error) throw new Error(data.error);
        setEntries(data.entries ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    },
    [apiPath]
  );

  const remember = useCallback(
    async (key: string, value: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(apiPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (data.error) throw new Error(data.error);
        // Refresh the entry list after writing
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    },
    [apiPath, refresh]
  );

  // Load all entries on mount
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { entries, isLoading, error, remember, recall, refresh };
}
