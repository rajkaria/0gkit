/**
 * Uniform async-state envelope every hook exposes. `data` and `error` are
 * mutually exclusive: a new run clears both until it settles.
 */
export interface AsyncState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
}

/** The action surface shared by every hook: state + a runner + a reset. */
export interface AsyncAction<Args extends unknown[], T> extends AsyncState<T> {
  /** Invoke the underlying operation. Resolves with the value; also rejects. */
  run: (...args: Args) => Promise<T>;
  /** Clear data/error/loading back to the idle state. */
  reset: () => void;
}
