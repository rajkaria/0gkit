export interface BackoffOptions {
  /** Base delay in ms. Default 250. */
  baseMs?: number;
  /** Upper bound on returned delay. Default 30_000. */
  maxMs?: number;
  /** Random source, injectable for tests. Default Math.random. */
  rng?: () => number;
}

/**
 * Decorrelated exponential backoff with jitter.
 *
 * For attempt N, returns a delay in [base * 2^N, base * 2^(N+1)] (clamped to maxMs).
 * This is the AWS "decorrelated jitter" shape: avoids the synchronized retry
 * storms of pure-exponential while keeping the upper bound predictable.
 */
export function expBackoffWithJitter(
  attempt: number,
  opts: BackoffOptions = {}
): number {
  const base = opts.baseMs ?? 250;
  const max = opts.maxMs ?? 30_000;
  const rng = opts.rng ?? Math.random;
  const lo = base * 2 ** attempt;
  const hi = lo * 2;
  const jittered = lo + rng() * (hi - lo);
  return Math.min(jittered, max);
}
