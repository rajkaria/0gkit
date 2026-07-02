/**
 * Unit tests for the trade-signal portable core.
 *
 * Uses pure in-memory mocks — NO network, NO real 0gkit packages.
 * Run via:
 *   ./packages/0gkit-kits/node_modules/.bin/vitest run --root templates/_kits/trade-signal
 *
 * TDD: tests were written BEFORE the implementation.
 *
 * HONESTY INVARIANTS VERIFIED HERE:
 *   1. The exported public API surface contains NO execute/trade/swap/send/transfer.
 *      (NEGATIVE test — load-bearing; this kit is ADVISORY-only, never an auto-trader.)
 *   2. analyzeSignal() returns a read-only buy/sell/hold signal from injected compute,
 *      and defaults SAFELY to "hold" (confidence 0) on malformed output — never throws.
 *   3. logSignal() writes an attested receipt to injected storage — no tx.
 *   4. attestSignal() signs + verifies a signal receipt — no storage, no tx.
 */

import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";

// ---------------------------------------------------------------------------
// NEGATIVE test: import the full public API module and assert the banned verbs
// are NOT present. This test exists for the lifetime of the kit — it guards
// against accidental future additions of execution-surface functions. A "trade
// signal" is an ADVISORY indicator; this kit must never grow an order-placing
// or value-moving function.
// ---------------------------------------------------------------------------

import * as signalApi from "../signal.js";
import * as signalLogApi from "../signalLog.js";

describe("PUBLIC API SURFACE — advisory-only, execution-free invariant", () => {
  it("lib/signal.ts exports contain no execute/trade/swap/send/transfer", () => {
    const banned = ["execute", "trade", "swap", "send", "transfer"];
    const exportedKeys = Object.keys(signalApi);
    for (const verb of banned) {
      const matches = exportedKeys.filter((k) => k.toLowerCase().includes(verb));
      expect(
        matches,
        `signal.ts must NOT export any key containing "${verb}" — found: ${matches.join(", ")}`
      ).toHaveLength(0);
    }
  });

  it("lib/signalLog.ts exports contain no execute/trade/swap/send/transfer", () => {
    const banned = ["execute", "trade", "swap", "send", "transfer"];
    const exportedKeys = Object.keys(signalLogApi);
    for (const verb of banned) {
      const matches = exportedKeys.filter((k) => k.toLowerCase().includes(verb));
      expect(
        matches,
        `signalLog.ts must NOT export any key containing "${verb}" — found: ${matches.join(", ")}`
      ).toHaveLength(0);
    }
  });

  it("combined public API exports only analysis/attestation functions (whitelist sanity check)", () => {
    const allExports = [...Object.keys(signalApi), ...Object.keys(signalLogApi)];
    expect(allExports).toContain("analyzeSignal");
    expect(allExports).toContain("logSignal");
    expect(allExports).toContain("attestSignal");
  });
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

import { analyzeSignal, type SignalInput, type AnalyzeSignalDeps } from "../signal.js";

import {
  logSignal,
  attestSignal,
  type SignalLogInput,
  type LogSignalDeps,
  type Attestor,
} from "../signalLog.js";

function mockCompute(output: string): AnalyzeSignalDeps["compute"] {
  return {
    async infer(_args: { prompt: string; model?: string }) {
      return { output };
    },
  };
}

function mockStorageClient(): LogSignalDeps["storage"] & { uploaded: Uint8Array[] } {
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
 * HMAC-backed mock attestor (structurally mimics the real signed-receipt
 * Attestor without any 0gkit dependency).
 */
function makeHmacAttestor(
  signerAddress: string,
  secret = "trade-signal-test-secret"
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

const SAMPLE_INPUT: SignalInput = {
  asset: "ETH",
  currentPrice: 3200,
  history: [3100, 3150, 3180, 3200],
  indicators: { rsi14: 58, sma20: 3120 },
};

// ---------------------------------------------------------------------------
// analyzeSignal() tests
// ---------------------------------------------------------------------------

describe("analyzeSignal", () => {
  it("returns a valid signal (action ∈ buy/sell/hold, confidence 0..1, rationale)", async () => {
    const raw = JSON.stringify({
      action: "buy",
      confidence: 0.72,
      rationale: "Uptrend with RSI below overbought.",
    });
    const deps: AnalyzeSignalDeps = { compute: mockCompute(raw) };
    const signal = await analyzeSignal(SAMPLE_INPUT, deps);

    expect(["buy", "sell", "hold"]).toContain(signal.action);
    expect(signal.confidence).toBeGreaterThanOrEqual(0);
    expect(signal.confidence).toBeLessThanOrEqual(1);
    expect(typeof signal.rationale).toBe("string");
    expect(signal.rationale.length).toBeGreaterThan(0);
    expect(signal.action).toBe("buy");
  });

  it("strips markdown fences around the JSON", async () => {
    const raw =
      "```json\n" +
      JSON.stringify({
        action: "sell",
        confidence: 0.4,
        rationale: "Momentum fading.",
      }) +
      "\n```";
    const signal = await analyzeSignal(SAMPLE_INPUT, { compute: mockCompute(raw) });
    expect(signal.action).toBe("sell");
  });

  it("clamps out-of-range confidence into [0, 1]", async () => {
    const high = await analyzeSignal(SAMPLE_INPUT, {
      compute: mockCompute(
        JSON.stringify({ action: "buy", confidence: 4.2, rationale: "x" })
      ),
    });
    expect(high.confidence).toBe(1);

    const low = await analyzeSignal(SAMPLE_INPUT, {
      compute: mockCompute(
        JSON.stringify({ action: "sell", confidence: -3, rationale: "y" })
      ),
    });
    expect(low.confidence).toBe(0);
  });

  it("defaults SAFELY to hold (confidence 0) on malformed output — never throws", async () => {
    let threw = false;
    let signal: Awaited<ReturnType<typeof analyzeSignal>> | undefined;
    try {
      signal = await analyzeSignal(SAMPLE_INPUT, {
        compute: mockCompute("not json at all"),
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(signal?.action).toBe("hold");
    expect(signal?.confidence).toBe(0);
  });

  it("defaults to hold when the model returns an unknown action", async () => {
    const signal = await analyzeSignal(SAMPLE_INPUT, {
      compute: mockCompute(
        JSON.stringify({ action: "moon", confidence: 0.9, rationale: "z" })
      ),
    });
    expect(signal.action).toBe("hold");
  });

  it("passes asset + price context into the compute prompt", async () => {
    let captured = "";
    const capturing: AnalyzeSignalDeps["compute"] = {
      async infer(args) {
        captured = args.prompt;
        return {
          output: JSON.stringify({ action: "hold", confidence: 0.5, rationale: "ok" }),
        };
      },
    };
    await analyzeSignal(SAMPLE_INPUT, { compute: capturing });
    expect(captured).toContain("ETH");
    expect(captured).toContain("3200");
  });

  it("passes model option through to compute when provided", async () => {
    let capturedModel: string | undefined;
    const capturing: AnalyzeSignalDeps["compute"] = {
      async infer(args) {
        capturedModel = args.model;
        return {
          output: JSON.stringify({ action: "hold", confidence: 0.5, rationale: "ok" }),
        };
      },
    };
    await analyzeSignal(SAMPLE_INPUT, { compute: capturing, model: "custom-model" });
    expect(capturedModel).toBe("custom-model");
  });
});

// ---------------------------------------------------------------------------
// logSignal() tests
// ---------------------------------------------------------------------------

const SAMPLE_LOG: SignalLogInput = {
  asset: "ETH",
  action: "buy",
  confidence: 0.72,
  rationale: "Uptrend with RSI below overbought.",
};

describe("logSignal", () => {
  it("returns a SignalRecord with id, input, receipt, attestation, storageRef, ts", async () => {
    const attestor = makeHmacAttestor(SIGNER);
    const storage = mockStorageClient();
    const record = await logSignal(SAMPLE_LOG, { attestor, storage });

    expect(typeof record.id).toBe("string");
    expect(record.id.length).toBeGreaterThan(0);
    expect(record.input).toEqual(SAMPLE_LOG);
    expect(record.receipt.asset).toBe("ETH");
    expect(record.receipt.action).toBe("buy");
    expect(typeof record.attestation.digest).toBe("string");
    expect(typeof record.attestation.signature).toBe("string");
    expect(record.storageRef).toBe("0xmockroot");
    expect(typeof record.ts).toBe("number");
  });

  it("uploads the record to storage as decodable JSON", async () => {
    const attestor = makeHmacAttestor(SIGNER);
    const storage = mockStorageClient();
    await logSignal(SAMPLE_LOG, { attestor, storage });

    expect(storage.uploaded.length).toBe(1);
    const parsed = JSON.parse(new TextDecoder().decode(storage.uploaded[0]));
    expect(parsed.input.asset).toBe("ETH");
    expect(parsed.receipt.action).toBe("buy");
  });

  it("signs the signal receipt (not some other object)", async () => {
    let signed: unknown;
    const captureAttestor: Attestor = {
      async sign(receipt: unknown) {
        signed = receipt;
        return { digest: "0xfake", signature: "0xfake" };
      },
      async verify() {
        return { ok: true, signer: SIGNER };
      },
    };
    await logSignal(SAMPLE_LOG, {
      attestor: captureAttestor,
      storage: mockStorageClient(),
    });
    const r = signed as Record<string, unknown>;
    expect(r.asset).toBe("ETH");
    expect(r.action).toBe("buy");
    expect(typeof r.ts).toBe("number");
  });

  it("round-trip: attestor.verify(receipt, attestation, SIGNER) returns ok=true", async () => {
    const attestor = makeHmacAttestor(SIGNER);
    const record = await logSignal(SAMPLE_LOG, {
      attestor,
      storage: mockStorageClient(),
    });
    const { ok } = await attestor.verify(record.receipt, record.attestation, SIGNER);
    expect(ok).toBe(true);
  });

  it("round-trip: tampered receipt returns ok=false", async () => {
    const attestor = makeHmacAttestor(SIGNER);
    const record = await logSignal(SAMPLE_LOG, {
      attestor,
      storage: mockStorageClient(),
    });
    const tampered = { ...record.receipt, action: "sell" as const };
    const { ok } = await attestor.verify(tampered, record.attestation, SIGNER);
    expect(ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// attestSignal() tests (sign + verify, no storage)
// ---------------------------------------------------------------------------

describe("attestSignal", () => {
  it("returns { receipt, attestation, verified:true } for a valid signer", async () => {
    const attestor = makeHmacAttestor(SIGNER);
    const sealed = await attestSignal(SAMPLE_LOG, { attestor }, SIGNER);

    expect(sealed.receipt.asset).toBe("ETH");
    expect(sealed.receipt.action).toBe("buy");
    expect(typeof sealed.attestation.digest).toBe("string");
    expect(sealed.verified).toBe(true);
  });

  it("returns verified:false when the expected signer does not match", async () => {
    const attestor = makeHmacAttestor(SIGNER);
    const sealed = await attestSignal(
      SAMPLE_LOG,
      { attestor },
      "0x0000000000000000000000000000000000000000"
    );
    expect(sealed.verified).toBe(false);
  });

  it("never throws when the attestor.verify throws — returns verified:false", async () => {
    const throwingAttestor: Attestor = {
      async sign() {
        return { digest: "0xd", signature: "0xs" };
      },
      async verify() {
        throw new Error("verify boom");
      },
    };
    let threw = false;
    let sealed: Awaited<ReturnType<typeof attestSignal>> | undefined;
    try {
      sealed = await attestSignal(SAMPLE_LOG, { attestor: throwingAttestor }, SIGNER);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(sealed?.verified).toBe(false);
  });
});
