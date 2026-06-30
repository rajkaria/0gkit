/**
 * yield-intel — portable core: yield analysis
 *
 * Dependency-free: accepts injected { compute } so this lib works on every base
 * and is fully unit-testable with mocks.
 *
 * HONESTY INVARIANTS (load-bearing — this kit's whole purpose)
 * ─────────────────────────────────────────────────────────────
 * This lib exposes ONLY read-only analysis. There is NO function that signs or
 * sends a value-moving transaction — no execute/trade/swap/send/transfer in the
 * public API surface. The lib test includes a NEGATIVE assertion that enforces
 * this invariant for the lifetime of the kit.
 *
 * The user reads the ranked analysis and decides on their own whether to act.
 * This kit is NOT an auto-trader.
 */

// ---------------------------------------------------------------------------
// Injected interfaces
// ---------------------------------------------------------------------------

/**
 * Thin wrapper around the compute provider. Adapters wire the real
 * @foundryprotocol/0gkit-compute Compute.inference here.
 * Lib NEVER imports any package — deps are injected.
 */
export interface ComputeClient {
  infer(args: { prompt: string; model?: string }): Promise<{ output: string }>;
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/**
 * A DeFi position the user holds (or is considering).
 * All fields are READ-ONLY input to the analysis — no mutation, no execution.
 */
export interface Position {
  /** Stable identifier for this position. */
  id: string;
  /** Protocol name, e.g. "Aave", "Compound", "Uniswap V3". */
  protocol: string;
  /** Asset or pair, e.g. "ETH", "USDC", "ETH/USDC". */
  asset: string;
  /** Current amount / value held in this position. */
  amount: number;
  /** Reported annual percentage yield (APY) at time of query. */
  apy: number;
}

/**
 * Per-position analysis item from the AI.
 * The score is the AI's relative ranking (higher = more favourable analysis).
 * The rationale is a plain-text explanation — never a trading instruction.
 */
export interface AnalysisItem {
  /** Matches the Position.id from the input. */
  id: string;
  /** Relative score from 0–100. Higher = more favourable analysis result. */
  score: number;
  /** Plain-text rationale from the AI. Does NOT instruct the user to act. */
  rationale: string;
}

// ---------------------------------------------------------------------------
// AnalysisDeps
// ---------------------------------------------------------------------------

export interface AnalysisDeps {
  /** Injected inference client — adapters wire real Compute; tests inject mocks. */
  compute: ComputeClient;
  /** Optional model override. */
  model?: string;
}

// ---------------------------------------------------------------------------
// analyze — the only public function; read-only
// ---------------------------------------------------------------------------

/**
 * Runs AI analysis over a list of DeFi positions, returning a ranked list
 * with per-item rationale.
 *
 * This function is INTENTIONALLY read-only:
 *  - It calls the injected compute client to get analysis text.
 *  - It returns ranked analysis items.
 *  - It does NOT call any value-moving function.
 *  - It does NOT sign any transaction.
 *
 * The user decides independently whether to act on the analysis.
 *
 * @param positions  DeFi positions to analyse.
 * @param deps       Injected compute + optional model.
 * @returns          Ranked list of AnalysisItem, sorted by descending score.
 *                   Returns [] on malformed compute output (never throws).
 */
export async function analyze(
  positions: Position[],
  deps: AnalysisDeps
): Promise<AnalysisItem[]> {
  const positionsSummary = positions
    .map(
      (p) =>
        `- id="${p.id}" protocol="${p.protocol}" asset="${p.asset}" amount=${p.amount} apy=${p.apy}%`
    )
    .join("\n");

  const prompt = [
    "You are a read-only DeFi yield analyst. Analyse the following positions and return a JSON array.",
    "For each position provide: id (matching the input), score (0-100, higher = more favourable",
    "analysis based on APY, risk profile, and asset quality), and rationale (one-sentence plain-text",
    "explanation — no trading instructions, no profit guarantees, no risk-free claims).",
    "Return ONLY a valid JSON array, no markdown fences, no other text.",
    "",
    "Positions to analyse:",
    positionsSummary,
  ].join("\n");

  const { output } = await deps.compute.infer({ prompt, model: deps.model });

  // Parse and validate — on any error return [] (never throw to caller)
  try {
    // Strip optional markdown fences if present
    const cleaned = output
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "");
    const parsed = JSON.parse(cleaned) as unknown;

    if (!Array.isArray(parsed)) return [];

    const items: AnalysisItem[] = [];
    for (const raw of parsed) {
      if (
        raw &&
        typeof raw === "object" &&
        typeof (raw as Record<string, unknown>).id === "string" &&
        typeof (raw as Record<string, unknown>).score === "number" &&
        typeof (raw as Record<string, unknown>).rationale === "string"
      ) {
        items.push({
          id: (raw as Record<string, unknown>).id as string,
          score: (raw as Record<string, unknown>).score as number,
          rationale: (raw as Record<string, unknown>).rationale as string,
        });
      }
    }

    // Return ranked by descending score
    return items.sort((a, b) => b.score - a.score);
  } catch {
    return [];
  }
}
