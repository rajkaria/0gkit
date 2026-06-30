/**
 * sealed-inference — React hook
 *
 * Calls the /api/sealed route handler to run sealed inference.
 * Works with any React or Next.js app that has the react-app or chat adapter applied.
 *
 * Usage:
 *   const { result, isLoading, error, run } = useSealedInference();
 */

"use client";

import { useState, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SealedReceipt {
  prompt: string;
  text: string;
  ts: number;
}

export interface SealedInferenceResult {
  text: string;
  receipt: SealedReceipt;
  attestation: { digest: string; signature: string };
  /**
   * Whether the signature was verified against the expected operator address.
   * true  → "✓ signature verified"
   * false → "⚠ unverified"
   *
   * This is NOT TEE-quote verification.
   */
  verified: boolean;
}

export interface UseSealedInferenceResult {
  result: SealedInferenceResult | null;
  isLoading: boolean;
  error: string | null;
  /** Run a sealed inference query. */
  run: (prompt: string, model?: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSealedInference(
  /** API route path. Defaults to "/api/sealed". */
  apiPath = "/api/sealed"
): UseSealedInferenceResult {
  const [result, setResult] = useState<SealedInferenceResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (prompt: string, model?: string) => {
      setIsLoading(true);
      setError(null);
      setResult(null);
      try {
        const res = await fetch(apiPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, ...(model ? { model } : {}) }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as SealedInferenceResult & { error?: string };
        if (data.error) throw new Error(data.error);
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    },
    [apiPath]
  );

  return { result, isLoading, error, run };
}
