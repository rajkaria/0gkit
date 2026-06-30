/**
 * prediction-market — lib unit tests (TDD)
 *
 * Pure in-memory mocks only — no @foundryprotocol/* packages imported.
 *
 * Key assertions:
 *   1. resolveMarket delegates to the injected resolveOracle (receives the question)
 *   2. After resolution the market is in "settled" state
 *   3. The receipt stored in storage contains { answer, answerHash, commitment }
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMarketStore,
  resolveMarket,
  openMarket,
  placeBet,
  type MarketStorage,
  type MarketDeps,
} from "../market.js";

// ---------------------------------------------------------------------------
// Mock oracle (injected resolveOracle)
// ---------------------------------------------------------------------------

function makeMockOracle(
  answer = "YES",
  answerHash = "0xabc123",
  commitment = { ref: "root-xyz", kind: "storage" as const }
) {
  return vi.fn().mockResolvedValue({
    answer,
    answerHash,
    receipt: { question: "Will ETH hit $5k?", answer, answerHash, ts: Date.now() },
    attestation: { digest: "0xdigest", signature: "0xsig" },
    commitment,
  });
}

// ---------------------------------------------------------------------------
// Mock storage (injected MarketStorage)
// ---------------------------------------------------------------------------

function makeMockStorage(): MarketStorage {
  const store = new Map<string, string>();
  return {
    async putBlob(ns: string, data: string): Promise<void> {
      store.set(ns, data);
    },
    async getBlob(ns: string): Promise<string | undefined> {
      return store.get(ns);
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("openMarket", () => {
  it("creates a market in 'open' state", async () => {
    const storage = makeMockStorage();
    const store = createMarketStore(storage);
    const market = await openMarket(store, {
      question: "Will ETH hit $5k by end of year?",
      closesAt: Date.now() + 86400_000,
    });
    expect(market.state).toBe("open");
    expect(market.question).toBe("Will ETH hit $5k by end of year?");
    expect(market.id).toBeTruthy();
  });

  it("assigns a unique id per market", async () => {
    const storage = makeMockStorage();
    const store = createMarketStore(storage);
    const m1 = await openMarket(store, {
      question: "Q1?",
      closesAt: Date.now() + 1000,
    });
    const m2 = await openMarket(store, {
      question: "Q2?",
      closesAt: Date.now() + 1000,
    });
    expect(m1.id).not.toBe(m2.id);
  });
});

describe("placeBet", () => {
  it("records a bet on an open market", async () => {
    const storage = makeMockStorage();
    const store = createMarketStore(storage);
    const market = await openMarket(store, {
      question: "Q1?",
      closesAt: Date.now() + 1000,
    });
    const bet = await placeBet(store, {
      marketId: market.id,
      bettor: "0xalice",
      prediction: "YES",
      amount: 1,
    });
    expect(bet.marketId).toBe(market.id);
    expect(bet.prediction).toBe("YES");
  });

  it("rejects bets on non-existent markets", async () => {
    const storage = makeMockStorage();
    const store = createMarketStore(storage);
    await expect(
      placeBet(store, {
        marketId: "no-such-id",
        bettor: "0xalice",
        prediction: "YES",
        amount: 1,
      })
    ).rejects.toThrow(/not found/i);
  });
});

describe("resolveMarket", () => {
  it("delegates to injected resolveOracle with the market question", async () => {
    const storage = makeMockStorage();
    const store = createMarketStore(storage);
    const market = await openMarket(store, {
      question: "Will ETH hit $5k?",
      closesAt: Date.now() + 1000,
    });

    const mockOracle = makeMockOracle();
    const deps: MarketDeps = { resolveOracle: mockOracle, storage };
    await resolveMarket(deps, market.id);

    expect(mockOracle).toHaveBeenCalledOnce();
    const [, question] = mockOracle.mock.calls[0] as [unknown, string];
    expect(question).toBe("Will ETH hit $5k?");
  });

  it("stores a resolution receipt containing { answer, answerHash, commitment }", async () => {
    const storage = makeMockStorage();
    const store = createMarketStore(storage);
    const market = await openMarket(store, {
      question: "Will BTC flip ETH?",
      closesAt: Date.now() + 1000,
    });

    const mockOracle = makeMockOracle("NO", "0xhash456", {
      ref: "commitment-ref-789",
      kind: "storage",
    });
    const deps: MarketDeps = { resolveOracle: mockOracle, storage };
    const result = await resolveMarket(deps, market.id);

    // Receipt must contain the three required fields
    expect(result.receipt.answer).toBe("NO");
    expect(result.receipt.answerHash).toBe("0xhash456");
    expect(result.receipt.commitment).toEqual({
      ref: "commitment-ref-789",
      kind: "storage",
    });
  });

  it("transitions market to 'settled' state after resolution", async () => {
    const storage = makeMockStorage();
    const store = createMarketStore(storage);
    const market = await openMarket(store, {
      question: "Will gas fees stay low?",
      closesAt: Date.now() + 1000,
    });

    const mockOracle = makeMockOracle();
    const deps: MarketDeps = { resolveOracle: mockOracle, storage };
    const result = await resolveMarket(deps, market.id);

    expect(result.market.state).toBe("settled");
  });

  it("persists the resolution receipt to storage", async () => {
    const storage = makeMockStorage();
    const putBlobSpy = vi.spyOn(storage, "putBlob");
    const store = createMarketStore(storage);
    const market = await openMarket(store, {
      question: "Will the 0G mainnet launch?",
      closesAt: Date.now() + 1000,
    });

    const mockOracle = makeMockOracle("YES", "0xdeadbeef", {
      ref: "anchor-ref-1",
      kind: "storage",
    });
    const deps: MarketDeps = { resolveOracle: mockOracle, storage };
    await resolveMarket(deps, market.id);

    // storage.putBlob must have been called to persist the receipt
    expect(putBlobSpy).toHaveBeenCalled();
  });

  it("rejects resolution of non-existent market", async () => {
    const storage = makeMockStorage();
    const mockOracle = makeMockOracle();
    const deps: MarketDeps = { resolveOracle: mockOracle, storage };
    await expect(resolveMarket(deps, "bogus-id")).rejects.toThrow(/not found/i);
    expect(mockOracle).not.toHaveBeenCalled();
  });
});
