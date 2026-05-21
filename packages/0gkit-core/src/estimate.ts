/**
 * Common cost-estimate envelope used by every 0gkit primitive's `.estimate()`.
 * `kind` discriminates the breakdown shape; `gas` is units, `fee` is wei.
 * `expectedSeconds` is best-effort latency (e.g. block time or polling round-trip).
 */
export interface Estimate {
  readonly kind: "storage" | "compute" | "da" | "contract";
  readonly gas: bigint;
  readonly fee: bigint;
  readonly breakdown: Record<string, string | number | bigint | undefined>;
  readonly expectedSeconds?: number;
}

/**
 * Returned by every write path when called with `{ dryRun: true }`.
 * The `result` field carries the same shape the success path would have
 * returned, but with no broadcast: `txHash` and any chain-side identifiers
 * are `undefined`. `estimate` is always populated.
 */
export interface DryRunResult<T> {
  readonly dryRun: true;
  readonly estimate: Estimate;
  readonly result: T;
}

/**
 * Human-readable wei → "<decimal> 0G".
 * Picks 4/6/9 decimal places by magnitude; falls back to scientific notation
 * for sub-gwei values so the rendering never collapses to "0".
 */
export function formatNative(wei: bigint): string {
  if (wei === 0n) return "0 0G";
  const ONE = 1_000_000_000_000_000_000n; // 1e18
  const GWEI = 1_000_000_000n; // 1e9
  const MICRO = 1_000_000_000_000n; // 1e12 = 1e-6 0G threshold
  if (wei < GWEI) {
    // sub-gwei: render in scientific notation against 0G (1e-18 base)
    const asZeroG = Number(wei) / Number(ONE);
    return `${asZeroG.toExponential().replace(/e\+?/, "e")} 0G`;
  }
  if (wei < MICRO) {
    // gwei-range (sub-microether): 9 decimals so 1 gwei renders as 0.000000001
    const dec = (Number(wei) / Number(ONE)).toFixed(9);
    return `${dec} 0G`;
  }
  if (wei < ONE) {
    // sub-1-0G but >= 1e-6 0G: 6 decimals
    const dec = (Number(wei) / Number(ONE)).toFixed(6);
    return `${dec} 0G`;
  }
  const whole = wei / ONE;
  const rem = wei % ONE;
  const fract = Number(rem) / Number(ONE);
  const combined = (Number(whole) + fract).toFixed(4);
  return `${combined} 0G`;
}

/**
 * Render an Estimate as an aligned key/value block. JSON callers should use
 * the structured Estimate directly; this is for human CLI output.
 */
export function formatEstimate(est: Estimate): string {
  const lines: string[] = [];
  lines.push(`kind        ${est.kind}`);
  lines.push(`gas         ${est.gas.toString()}`);
  lines.push(`fee         ${formatNative(est.fee)}`);
  for (const [k, v] of Object.entries(est.breakdown)) {
    if (v === undefined) continue;
    const val = typeof v === "bigint" ? v.toString() : String(v);
    lines.push(`${k.padEnd(12)}${val}`);
  }
  if (est.expectedSeconds !== undefined) {
    lines.push(`expected    ~${est.expectedSeconds}s`);
  }
  return lines.join("\n");
}
