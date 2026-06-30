/**
 * prediction-market — portable core
 *
 * Dependency-free: accepts injected { resolveOracle, storage } so the lib
 * works on every base and is fully unit-testable with mocks.
 *
 * Composition seam
 * ─────────────────
 * This kit COMPOSES ai-oracle. When the prediction-market kit is applied to a
 * base, the engine first writes ai-oracle's lib/oracle.ts into the project,
 * then this lib/market.ts. The adapters wire the composed resolveOracle from
 * the co-located lib/oracle.ts (relative import). This lib only types the
 * injected resolveOracle as an opaque async function — no direct dependency on
 * oracle.ts at the lib layer.
 *
 * Storage model
 * ──────────────
 * Markets, bets, and receipts are persisted via the injected MarketStorage
 * interface using the content-addressed root-registry pattern from agent-memory:
 * upload() returns an immutable root hash; a module-level registry (or
 * persistent store in production) maps namespace keys to the latest root.
 * The Indexer (subscription-based event emitter) is NOT used — it requires an
 * event-emitting contract and is out of scope.
 *
 * Lifecycle: open → (bets) → resolve → settled
 */

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Injected storage interface (adapters and tests provide implementations)
// ---------------------------------------------------------------------------

/**
 * Minimal blob storage interface. Adapters wire the real
 * @foundryprotocol/0gkit-storage behind the root-registry pattern.
 */
export interface MarketStorage {
  putBlob(ns: string, data: string): Promise<void>;
  getBlob(ns: string): Promise<string | undefined>;
}

// ---------------------------------------------------------------------------
// Oracle result shape (mirrors OracleResult from ai-oracle lib, but typed here
// as a simple interface so this lib has NO import dependency on oracle.ts)
// ---------------------------------------------------------------------------

export interface OracleResult {
  answer: string;
  answerHash: string;
  receipt: {
    question: string;
    answer: string;
    answerHash: string;
    ts: number;
  };
  attestation: { digest: string; signature: string };
  commitment: { ref: string; kind: "storage" | "onchain" };
}

/**
 * Injected oracle resolver. In adapters, this is the real `resolveOracle`
 * imported from the co-located `../../../lib/oracle.js` (ai-oracle lib file
 * placed by the composition engine). In tests, it is a mock.
 *
 * The first argument (deps) is injected by the adapter as a bound partial;
 * the adapter passes `(question) => resolveOracle(oracleDeps, question)`.
 * See MarketDeps.resolveOracle below.
 */
export type OracleResolver = (
  deps: unknown,
  question: string
) => Promise<OracleResult>;

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type MarketState = "open" | "resolved" | "settled";

export interface Market {
  id: string;
  question: string;
  state: MarketState;
  closesAt: number; // Unix ms
  createdAt: number;
  resolution?: MarketResolution;
}

export interface Bet {
  id: string;
  marketId: string;
  bettor: string;
  prediction: string; // e.g. "YES" | "NO" | free-form
  amount: number;
  placedAt: number;
}

export interface MarketResolution {
  answer: string;
  answerHash: string;
  attestation: { digest: string; signature: string };
  commitment: { ref: string; kind: "storage" | "onchain" };
  resolvedAt: number;
}

/**
 * The resolution receipt persisted to storage. Contains the three required
 * fields: answer, answerHash, commitment — plus the full oracle output for
 * auditability.
 */
export interface ResolutionReceipt {
  marketId: string;
  answer: string;
  answerHash: string;
  commitment: { ref: string; kind: "storage" | "onchain" };
  attestation: { digest: string; signature: string };
  oracleReceipt: {
    question: string;
    answer: string;
    answerHash: string;
    ts: number;
  };
  resolvedAt: number;
}

export interface ResolveResult {
  market: Market;
  receipt: ResolutionReceipt;
}

// ---------------------------------------------------------------------------
// MarketDeps (injected; adapters and tests provide impls)
// ---------------------------------------------------------------------------

export interface MarketDeps {
  /**
   * The composed ai-oracle resolver. Adapters bind oracle deps and pass a
   * curried function: `(question) => resolveOracle(oracleDeps, question)`.
   * The lib treats this as an opaque async function to stay dep-free.
   */
  resolveOracle: (deps: unknown, question: string) => Promise<OracleResult>;
  /** Market blob storage. */
  storage: MarketStorage;
}

// ---------------------------------------------------------------------------
// MarketStore (thin CRUD layer over MarketStorage)
// ---------------------------------------------------------------------------

const MARKETS_NS = "prediction-market:markets";
const BETS_NS = "prediction-market:bets";

export interface MarketStore {
  getMarket(id: string): Promise<Market | undefined>;
  saveMarket(market: Market): Promise<void>;
  listMarkets(): Promise<Market[]>;
  saveBet(bet: Bet): Promise<void>;
  listBets(marketId: string): Promise<Bet[]>;
}

function parseJsonLines<T>(raw: string | undefined): T[] {
  if (!raw || raw.trim() === "") return [];
  const results: T[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      results.push(JSON.parse(t) as T);
    } catch {
      // skip malformed lines
    }
  }
  return results;
}

/**
 * Creates a MarketStore backed by the injected MarketStorage.
 * Uses the same JSONL + root-registry pattern as agent-memory.
 */
export function createMarketStore(storage: MarketStorage): MarketStore {
  async function readMarkets(): Promise<Market[]> {
    return parseJsonLines<Market>(await storage.getBlob(MARKETS_NS));
  }

  async function readBets(): Promise<Bet[]> {
    return parseJsonLines<Bet>(await storage.getBlob(BETS_NS));
  }

  async function saveMarket(market: Market): Promise<void> {
    const existing = await readMarkets();
    // Replace if already present (update), otherwise append
    const idx = existing.findIndex((m) => m.id === market.id);
    if (idx >= 0) {
      existing[idx] = market;
    } else {
      existing.push(market);
    }
    const blob = existing.map((m) => JSON.stringify(m)).join("\n");
    await storage.putBlob(MARKETS_NS, blob);
  }

  async function getMarket(id: string): Promise<Market | undefined> {
    const all = await readMarkets();
    return all.find((m) => m.id === id);
  }

  async function listMarkets(): Promise<Market[]> {
    return readMarkets();
  }

  async function saveBet(bet: Bet): Promise<void> {
    const existing = await readBets();
    existing.push(bet);
    const blob = existing.map((b) => JSON.stringify(b)).join("\n");
    await storage.putBlob(BETS_NS, blob);
  }

  async function listBets(marketId: string): Promise<Bet[]> {
    const all = await readBets();
    return all.filter((b) => b.marketId === marketId);
  }

  return { getMarket, saveMarket, listMarkets, saveBet, listBets };
}

// ---------------------------------------------------------------------------
// ID generation (deterministic-ish, no external deps)
// ---------------------------------------------------------------------------

function generateId(prefix: string): string {
  const ts = Date.now().toString(16);
  const rand = createHash("sha256")
    .update(`${prefix}:${ts}:${Math.random()}`)
    .digest("hex")
    .slice(0, 8);
  return `${prefix}-${ts}-${rand}`;
}

// ---------------------------------------------------------------------------
// openMarket
// ---------------------------------------------------------------------------

export interface OpenMarketArgs {
  question: string;
  closesAt: number;
}

/**
 * Opens a new prediction market.
 */
export async function openMarket(
  store: MarketStore,
  args: OpenMarketArgs
): Promise<Market> {
  const market: Market = {
    id: generateId("mkt"),
    question: args.question,
    state: "open",
    closesAt: args.closesAt,
    createdAt: Date.now(),
  };
  await store.saveMarket(market);
  return market;
}

// ---------------------------------------------------------------------------
// placeBet
// ---------------------------------------------------------------------------

export interface PlaceBetArgs {
  marketId: string;
  bettor: string;
  prediction: string;
  amount: number;
}

/**
 * Places a bet on an open market.
 * Throws if the market is not found.
 */
export async function placeBet(
  store: MarketStore,
  args: PlaceBetArgs
): Promise<Bet> {
  const market = await store.getMarket(args.marketId);
  if (!market) {
    throw new Error(`Market not found: ${args.marketId}`);
  }
  const bet: Bet = {
    id: generateId("bet"),
    marketId: args.marketId,
    bettor: args.bettor,
    prediction: args.prediction,
    amount: args.amount,
    placedAt: Date.now(),
  };
  await store.saveBet(bet);
  return bet;
}

// ---------------------------------------------------------------------------
// resolveMarket (core action — delegates to injected resolveOracle)
// ---------------------------------------------------------------------------

/**
 * Resolves a market by delegating to the injected oracle resolver.
 *
 * Adapter wiring (how resolveOracle is called from adapters):
 *   const boundOracle = (deps: unknown, question: string) =>
 *     resolveOracle(oracleDeps, question);
 *   await resolveMarket({ resolveOracle: boundOracle, storage }, marketId);
 *
 * The lib ALWAYS passes `null` as the deps argument — the adapter wraps
 * resolveOracle so that its real deps are already bound via closure. This
 * keeps the lib dep-free while letting adapters inject the full oracle chain.
 *
 * @param deps  Injected oracle resolver + storage.
 * @param id    Market ID to resolve.
 * @returns     ResolveResult with updated market (state="settled") + receipt.
 */
export async function resolveMarket(
  deps: MarketDeps,
  id: string
): Promise<ResolveResult> {
  const store = createMarketStore(deps.storage);
  const market = await store.getMarket(id);
  if (!market) {
    throw new Error(`Market not found: ${id}`);
  }

  // Delegate to the composed oracle resolver
  // deps is null — the adapter has already bound the real oracle deps via closure
  const oracleResult = await deps.resolveOracle(null, market.question);

  // Build and persist the resolution receipt
  const receipt: ResolutionReceipt = {
    marketId: id,
    answer: oracleResult.answer,
    answerHash: oracleResult.answerHash,
    commitment: oracleResult.commitment,
    attestation: oracleResult.attestation,
    oracleReceipt: oracleResult.receipt,
    resolvedAt: Date.now(),
  };

  const receiptNs = `prediction-market:receipt:${id}`;
  await deps.storage.putBlob(receiptNs, JSON.stringify(receipt));

  // Transition market to settled
  const updatedMarket: Market = {
    ...market,
    state: "settled",
    resolution: {
      answer: oracleResult.answer,
      answerHash: oracleResult.answerHash,
      attestation: oracleResult.attestation,
      commitment: oracleResult.commitment,
      resolvedAt: receipt.resolvedAt,
    },
  };
  await store.saveMarket(updatedMarket);

  return { market: updatedMarket, receipt };
}
