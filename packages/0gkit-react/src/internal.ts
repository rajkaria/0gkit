import { useCallback, useRef, useState } from "react";
import type { AsyncAction, AsyncState } from "./types.js";

const IDLE: AsyncState<never> = {
  data: undefined,
  error: undefined,
  loading: false,
};

/**
 * The single state machine behind every 0gkit hook. `fn` is read through a ref
 * so callers may pass a fresh closure each render without re-creating `run`.
 * `run` resolves with the value and also rejects, so a component can either
 * read `data`/`error` reactively or `await` the call directly.
 */
export function useAsyncAction<Args extends unknown[], T>(
  fn: (...args: Args) => Promise<T>
): AsyncAction<Args, T> {
  const [state, setState] = useState<AsyncState<T>>(IDLE);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async (...args: Args): Promise<T> => {
    setState({ data: undefined, error: undefined, loading: true });
    try {
      const data = await fnRef.current(...args);
      setState({ data, error: undefined, loading: false });
      return data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setState({ data: undefined, error, loading: false });
      throw error;
    }
  }, []);

  const reset = useCallback(() => setState(IDLE), []);

  return { ...state, run, reset };
}
