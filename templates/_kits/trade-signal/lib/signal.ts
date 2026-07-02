/**
 * trade-signal — portable core: advisory signal analysis
 *
 * Dependency-free: accepts injected { compute } so this lib works on every base
 * and is fully unit-testable with mocks. Lib NEVER imports any package.
 *
 * HONESTY INVARIANTS (load-bearing — this kit's whole purpose)
 * ─────────────────────────────────────────────────────────────
 * This lib produces an ADVISORY signal only — a buy/sell/hold recommendation
 * with a confidence and a plain-text rationale. There is NO function anywhere
 * in this kit that places an order or moves value: no execute/trade/swap/send/
 * transfer in the public API surface. The lib test enforces this with a
 * NEGATIVE assertion for the lifetime of the kit.
 *
 * The user reads the signal and decides — on their own — whether to act. This
 * kit is NOT an auto-trader.
 *
 * SAFE DEFAULT: on any malformed / unparseable model output, analyzeSignal
 * returns { action: "hold", confidence: 0 } and NEVER throws. "Hold" is the
 * conservative default — we never fabricate a buy/sell from garbage output.
 */

// ---------------------------------------------------------------------------
// Injected interfaces
// ---------------------------------------------------------------------------

/**
 * Thin wrapper around the compute provider. Adapters wire the real
 * @foundryprotocol/0gkit-compute Compute here. Lib NEVER imports any package —
 * deps are injected.
 */
export interface ComputeClient {
  infer(args: { prompt: string; model?: string }): Promise<{ output: string }>;
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/** The only actions a signal can recommend. Advisory — never executed. */
export type SignalAction = "buy" | "sell" | "hold";

/**
 * Read-only market context for a single asset.
 * All fields are INPUT to the analysis — nothing here is mutated or executed.
 */
export interface SignalInput {
  /** Asset ticker, e.g. "ETH", "BTC". */
  asset: string;
  /** Most recent price. */
  currentPrice: number;
  /** Recent price history, oldest → newest. */
  history: number[];
  /** Optional technical indicators, e.g. { rsi14: 58, sma20: 3120 }. */
  indicators?: Record<string, number>;
}

/**
 * The advisory signal returned by the AI.
 * `rationale` is a plain-text explanation — never an order or a guarantee.
 */
export interface Signal {
  /** Advisory action: buy / sell / hold. */
  action: SignalAction;
  /** Confidence in [0, 1]. Clamped — never NaN, never out of range. */
  confidence: number;
  /** Plain-text rationale. Does NOT instruct the user to execute anything. */
  rationale: string;
}

// ---------------------------------------------------------------------------
// AnalyzeSignalDeps
// ---------------------------------------------------------------------------

export interface AnalyzeSignalDeps {
  /** Injected inference client — adapters wire real Compute; tests inject mocks. */
  compute: ComputeClient;
  /** Optional model override. */
  model?: string;
}

// ---------------------------------------------------------------------------
// analyzeSignal — the only public function; read-only, advisory
// ---------------------------------------------------------------------------

const VALID_ACTIONS: ReadonlySet<string> = new Set<SignalAction>([
  "buy",
  "sell",
  "hold",
]);

/** Conservative default when output is unusable. Never fabricate a buy/sell. */
function holdDefault(rationale: string): Signal {
  return { action: "hold", confidence: 0, rationale };
}

function clampConfidence(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Runs AI analysis over read-only market context and returns an advisory
 * buy/sell/hold signal with a confidence and rationale.
 *
 * This function is INTENTIONALLY advisory:
 *  - It calls the injected compute client for an analysis.
 *  - It returns a signal object.
 *  - It does NOT place an order, sign a transaction, or move value.
 *
 * On malformed output it returns a SAFE "hold" default and NEVER throws.
 *
 * @param input  Read-only market context for the asset.
 * @param deps   Injected compute + optional model.
 * @returns      An advisory Signal (always valid; defaults to hold).
 */
export async function analyzeSignal(
  input: SignalInput,
  deps: AnalyzeSignalDeps
): Promise<Signal> {
  const historyStr = input.history.length ? input.history.join(", ") : "(none)";
  const indicatorsStr = input.indicators
    ? Object.entries(input.indicators)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")
    : "(none)";

  const prompt = [
    "You are a read-only market analyst. Given the market context below, return an ADVISORY",
    'signal as a JSON object: { "action": "buy" | "sell" | "hold", "confidence": 0-1, "rationale": "..." }.',
    "The rationale must be one sentence of plain text — no order instructions, no profit guarantees,",
    "no risk-free claims. You are NOT executing anything; you only advise. Return ONLY the JSON object,",
    "no markdown fences, no other text.",
    "",
    `Asset: ${input.asset}`,
    `Current price: ${input.currentPrice}`,
    `Price history (oldest→newest): ${historyStr}`,
    `Indicators: ${indicatorsStr}`,
  ].join("\n");

  let output: string;
  try {
    ({ output } = await deps.compute.infer({ prompt, model: deps.model }));
  } catch {
    // Inference failure → safe hold; never throw to the caller.
    return holdDefault("Signal unavailable — inference failed; defaulting to hold.");
  }

  try {
    const cleaned = output
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "");
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    const action =
      typeof parsed.action === "string" && VALID_ACTIONS.has(parsed.action)
        ? (parsed.action as SignalAction)
        : "hold";

    const rationale =
      typeof parsed.rationale === "string" && parsed.rationale.length > 0
        ? parsed.rationale
        : "No rationale provided.";

    // If the model returned an unknown action, treat as an inconclusive hold.
    if (action === "hold" && parsed.action !== "hold") {
      return holdDefault(rationale);
    }

    return { action, confidence: clampConfidence(parsed.confidence), rationale };
  } catch {
    return holdDefault(
      "Signal unavailable — model output was not valid JSON; defaulting to hold."
    );
  }
}
