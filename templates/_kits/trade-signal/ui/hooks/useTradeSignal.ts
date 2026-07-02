/**
 * trade-signal — React hook
 *
 * Calls the /api/signal route handler to (a) get an advisory buy/sell/hold
 * signal and (b) optionally log an attested receipt to 0G Storage.
 * Works with any React or Next.js app that has the react-app or chat adapter applied.
 *
 * ADVISORY-only: this hook never places an order or moves value. It fetches a
 * recommendation and, if the user chooses, records a signed receipt.
 *
 * Usage:
 *   const { signal, record, isLoading, error, getSignal, logSignal } = useTradeSignal();
 */

"use client";

import { useState, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types (mirror lib/signal.ts + lib/signalLog.ts public shapes)
// ---------------------------------------------------------------------------

export type SignalAction = "buy" | "sell" | "hold";

export interface SignalInput {
  asset: string;
  currentPrice: number;
  history: number[];
  indicators?: Record<string, number>;
}

export interface Signal {
  action: SignalAction;
  confidence: number;
  rationale: string;
}

export interface SignalReceipt {
  asset: string;
  action: SignalAction;
  confidence: number;
  rationale: string;
  ts: number;
}

export interface SignalRecord {
  id: string;
  input: {
    asset: string;
    action: SignalAction;
    confidence: number;
    rationale: string;
  };
  receipt: SignalReceipt;
  attestation: { digest: string; signature: string };
  storageRef: string;
  ts: number;
}

export interface UseTradeSignalResult {
  /** Latest advisory signal, or null. */
  signal: Signal | null;
  /** Latest attested record from logSignal, or null. */
  record: SignalRecord | null;
  isLoading: boolean;
  error: string | null;
  /** Fetch an advisory buy/sell/hold signal for the given market context. */
  getSignal: (input: SignalInput, model?: string) => Promise<Signal | null>;
  /** Record an attested receipt for a signal (persists to 0G Storage). */
  logSignal: (signal: {
    asset: string;
    action: SignalAction;
    confidence: number;
    rationale: string;
  }) => Promise<SignalRecord | null>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTradeSignal(
  /** API route path. Defaults to "/api/signal". */
  apiPath = "/api/signal"
): UseTradeSignalResult {
  const [signal, setSignal] = useState<Signal | null>(null);
  const [record, setRecord] = useState<SignalRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getSignal = useCallback(
    async (input: SignalInput, model?: string): Promise<Signal | null> => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(apiPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "analyze",
            input,
            ...(model ? { model } : {}),
          }),
        });
        const data = (await res.json()) as { signal?: Signal; error?: string };
        if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
        setSignal(data.signal ?? null);
        return data.signal ?? null;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [apiPath]
  );

  const logSignal = useCallback(
    async (sig: {
      asset: string;
      action: SignalAction;
      confidence: number;
      rationale: string;
    }): Promise<SignalRecord | null> => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(apiPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "log", signal: sig }),
        });
        const data = (await res.json()) as { record?: SignalRecord; error?: string };
        if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
        setRecord(data.record ?? null);
        return data.record ?? null;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [apiPath]
  );

  return { signal, record, isLoading, error, getSignal, logSignal };
}
