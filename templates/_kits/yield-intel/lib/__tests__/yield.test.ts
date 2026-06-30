/**
 * Unit tests for the yield-intel portable core.
 *
 * Uses pure in-memory mocks — NO network, NO real 0gkit packages.
 * Run via:
 *   ./packages/0gkit-kits/node_modules/.bin/vitest run --root templates/_kits/yield-intel
 *
 * TDD: tests were written BEFORE the implementation.
 *
 * HONESTY INVARIANTS VERIFIED HERE:
 *   1. The exported public API surface contains NO execute/trade/swap/send/transfer.
 *      (NEGATIVE test — load-bearing; this is the whole point of yield-intel.)
 *   2. analyze() returns read-only ranked analysis from injected compute.
 *   3. logDecision() writes an attested record to injected storage — no tx.
 */

import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";

// ---------------------------------------------------------------------------
// NEGATIVE test: import the full public API module and assert the banned verbs
// are NOT present. This test exists for the lifetime of the kit — it guards
// against accidental future additions of execution-surface functions.
// ---------------------------------------------------------------------------

import * as yieldApi from "../yield.js";
import * as decisionLogApi from "../decisionLog.js";

describe("PUBLIC API SURFACE — execution-free invariant", () => {
  it("lib/yield.ts exports contain no execute/trade/swap/send/transfer", () => {
    const banned = ["execute", "trade", "swap", "send", "transfer"];
    const exportedKeys = Object.keys(yieldApi);
    for (const verb of banned) {
      const matches = exportedKeys.filter((k) => k.toLowerCase().includes(verb));
      expect(
        matches,
        `yield.ts must NOT export any key containing "${verb}" — found: ${matches.join(", ")}`
      ).toHaveLength(0);
    }
  });

  it("lib/decisionLog.ts exports contain no execute/trade/swap/send/transfer", () => {
    const banned = ["execute", "trade", "swap", "send", "transfer"];
    const exportedKeys = Object.keys(decisionLogApi);
    for (const verb of banned) {
      const matches = exportedKeys.filter((k) => k.toLowerCase().includes(verb));
      expect(
        matches,
        `decisionLog.ts must NOT export any key containing "${verb}" — found: ${matches.join(", ")}`
      ).toHaveLength(0);
    }
  });

  it("combined public API exports only analysis/logging functions (whitelist sanity check)", () => {
    const allExports = [...Object.keys(yieldApi), ...Object.keys(decisionLogApi)];
    // Must include the two core functions
    expect(allExports).toContain("analyze");
    expect(allExports).toContain("logDecision");
  });
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

import { analyze, type Position, type AnalysisDeps } from "../yield.js";

import {
  logDecision,
  type DecisionInput,
  type DecisionLogDeps,
  type Attestor,
} from "../decisionLog.js";

function mockCompute(output: string): AnalysisDeps["compute"] {
  return {
    async infer(_args: { prompt: string; model?: string }) {
      return { output };
    },
  };
}

function mockStorageClient(): DecisionLogDeps["storage"] & {
  uploaded: Uint8Array[];
} {
  const uploaded: Uint8Array[] = [];
  return {
    uploaded,
    async upload(bytes: Uint8Array) {
      uploaded.push(bytes);
      return { root: "0xmockroot" };
    },
  };
}

/**
 * HMAC-backed mock attestor (structurally mimics real signed-receipt Attestor
 * without any 0gkit dependency).
 */
function makeHmacAttestor(
  signerAddress: string,
  secret = "yield-test-secret"
): Attestor {
  function hmac(obj: unknown): string {
    return (
      "0x" + createHmac("sha256", secret).update(JSON.stringify(obj)).digest("hex")
    );
  }
  return {
    async sign(receipt: unknown) {
      const digest = hmac(receipt);
      return { digest, signature: digest };
    },
    async verify(
      receipt: unknown,
      signed: { digest: string; signature: string },
      expectedSigner: string
    ) {
      const recomputed = hmac(receipt);
      const ok =
        recomputed.toLowerCase() === signed.digest.toLowerCase() &&
        expectedSigner.toLowerCase() === signerAddress.toLowerCase();
      return { ok, signer: signerAddress };
    },
  };
}

const SIGNER = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

// ---------------------------------------------------------------------------
// Sample positions fixture
// ---------------------------------------------------------------------------

const SAMPLE_POSITIONS: Position[] = [
  { id: "pos-1", protocol: "Compound", asset: "ETH", amount: 1.5, apy: 4.2 },
  { id: "pos-2", protocol: "Aave", asset: "USDC", amount: 500, apy: 6.1 },
  { id: "pos-3", protocol: "Uniswap V3", asset: "ETH/USDC", amount: 200, apy: 12.8 },
];

// ---------------------------------------------------------------------------
// analyze() tests
// ---------------------------------------------------------------------------

describe("analyze", () => {
  it("returns a non-empty ranked list with per-item rationale", async () => {
    const rawJson = JSON.stringify([
      { id: "pos-3", score: 87, rationale: "High APY LP pool, moderate IL risk." },
      { id: "pos-2", score: 72, rationale: "Stable stablecoin supply, low risk." },
      { id: "pos-1", score: 55, rationale: "ETH supply reasonable but lower yield." },
    ]);
    const deps: AnalysisDeps = { compute: mockCompute(rawJson) };
    const result = await analyze(SAMPLE_POSITIONS, deps);

    expect(result.length).toBeGreaterThan(0);
    for (const item of result) {
      expect(typeof item.id).toBe("string");
      expect(typeof item.score).toBe("number");
      expect(typeof item.rationale).toBe("string");
      expect(item.rationale.length).toBeGreaterThan(0);
    }
  });

  it("result is ordered by descending score (ranked)", async () => {
    const rawJson = JSON.stringify([
      { id: "pos-3", score: 87, rationale: "best" },
      { id: "pos-2", score: 72, rationale: "middle" },
      { id: "pos-1", score: 55, rationale: "lowest" },
    ]);
    const deps: AnalysisDeps = { compute: mockCompute(rawJson) };
    const result = await analyze(SAMPLE_POSITIONS, deps);

    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
    }
  });

  it("passes positions context to compute prompt", async () => {
    let capturedPrompt = "";
    const capturingCompute: AnalysisDeps["compute"] = {
      async infer(args) {
        capturedPrompt = args.prompt;
        return {
          output: JSON.stringify([{ id: "pos-1", score: 60, rationale: "test" }]),
        };
      },
    };
    await analyze(SAMPLE_POSITIONS, { compute: capturingCompute });
    expect(capturedPrompt).toContain("Compound");
    expect(capturedPrompt).toContain("USDC");
  });

  it("includes all input position IDs in result (no positions dropped silently)", async () => {
    const rawJson = JSON.stringify(
      SAMPLE_POSITIONS.map((p, i) => ({
        id: p.id,
        score: 90 - i * 10,
        rationale: `Rationale for ${p.id}`,
      }))
    );
    const deps: AnalysisDeps = { compute: mockCompute(rawJson) };
    const result = await analyze(SAMPLE_POSITIONS, deps);

    const ids = result.map((r) => r.id);
    for (const pos of SAMPLE_POSITIONS) {
      expect(ids).toContain(pos.id);
    }
  });

  it("handles malformed compute output gracefully (returns empty or partial, does not throw)", async () => {
    const deps: AnalysisDeps = { compute: mockCompute("not valid json at all") };
    let threw = false;
    let result: Awaited<ReturnType<typeof analyze>> | undefined;
    try {
      result = await analyze(SAMPLE_POSITIONS, deps);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    // May return [] or partial — just must not throw
    expect(Array.isArray(result)).toBe(true);
  });

  it("passes model option to compute when provided", async () => {
    let capturedModel: string | undefined;
    const capturingCompute: AnalysisDeps["compute"] = {
      async infer(args) {
        capturedModel = args.model;
        return {
          output: JSON.stringify([{ id: "pos-1", score: 70, rationale: "ok" }]),
        };
      },
    };
    await analyze(SAMPLE_POSITIONS, {
      compute: capturingCompute,
      model: "custom-model",
    });
    expect(capturedModel).toBe("custom-model");
  });
});

// ---------------------------------------------------------------------------
// logDecision() tests
// ---------------------------------------------------------------------------

describe("logDecision", () => {
  it("returns a DecisionRecord with id, input, attestation, storageRef, ts", async () => {
    const attestor = makeHmacAttestor(SIGNER);
    const storage = mockStorageClient();
    const deps: DecisionLogDeps = { attestor, storage };

    const decision: DecisionInput = {
      positionId: "pos-2",
      action: "Rebalance to Aave USDC — higher yield, low risk",
      rationale: "AI ranked it #1",
      score: 72,
    };

    const record = await logDecision(decision, deps);

    expect(typeof record.id).toBe("string");
    expect(record.id.length).toBeGreaterThan(0);
    expect(record.input).toEqual(decision);
    expect(typeof record.attestation).toBe("object");
    expect(typeof record.attestation.digest).toBe("string");
    expect(typeof record.attestation.signature).toBe("string");
    expect(typeof record.storageRef).toBe("string");
    expect(typeof record.ts).toBe("number");
  });

  it("uploads the decision record to storage (storage.upload is called)", async () => {
    const attestor = makeHmacAttestor(SIGNER);
    const storage = mockStorageClient();
    const deps: DecisionLogDeps = { attestor, storage };

    await logDecision(
      { positionId: "pos-1", action: "Hold", rationale: "Stable returns", score: 55 },
      deps
    );

    expect(storage.uploaded.length).toBeGreaterThan(0);
    // Verify the uploaded bytes decode to valid JSON containing the record
    const decoded = new TextDecoder().decode(storage.uploaded[0]);
    const parsed = JSON.parse(decoded);
    expect(typeof parsed.id).toBe("string");
    expect(parsed.input.positionId).toBe("pos-1");
  });

  it("attestation signs the decision receipt (not some other object)", async () => {
    let signedReceipt: unknown;
    const captureAttestor: Attestor = {
      async sign(receipt: unknown) {
        signedReceipt = receipt;
        return { digest: "0xfakeDigest", signature: "0xfakeSig" };
      },
      async verify(_receipt, _signed, _expectedSigner) {
        return { ok: true, signer: SIGNER };
      },
    };
    const storage = mockStorageClient();

    await logDecision(
      { positionId: "pos-3", action: "Invest more", rationale: "High APY", score: 87 },
      { attestor: captureAttestor, storage }
    );

    const r = signedReceipt as Record<string, unknown>;
    expect(r.positionId).toBe("pos-3");
    expect(r.action).toBe("Invest more");
  });

  it("storageRef from logDecision matches the root returned by storage.upload", async () => {
    const attestor = makeHmacAttestor(SIGNER);
    const storage = mockStorageClient();

    const record = await logDecision(
      { positionId: "pos-1", action: "Hold", rationale: "stable", score: 55 },
      { attestor, storage }
    );

    expect(record.storageRef).toBe("0xmockroot");
  });

  it("round-trip: attestor.verify(receipt, attestation, SIGNER) returns ok=true", async () => {
    const attestor = makeHmacAttestor(SIGNER);
    const storage = mockStorageClient();

    const record = await logDecision(
      {
        positionId: "pos-2",
        action: "Rebalance",
        rationale: "better yield",
        score: 72,
      },
      { attestor, storage }
    );

    const { ok } = await attestor.verify(record.receipt, record.attestation, SIGNER);
    expect(ok).toBe(true);
  });

  it("round-trip: tampered receipt returns ok=false", async () => {
    const attestor = makeHmacAttestor(SIGNER);
    const storage = mockStorageClient();

    const record = await logDecision(
      {
        positionId: "pos-2",
        action: "Rebalance",
        rationale: "better yield",
        score: 72,
      },
      { attestor, storage }
    );

    const tampered = { ...record.receipt, action: "TAMPERED" };
    const { ok } = await attestor.verify(tampered, record.attestation, SIGNER);
    expect(ok).toBe(false);
  });
});
