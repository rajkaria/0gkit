import { describe, it, expect } from "vitest";
import type { Receipt } from "../receipt.js";

describe("Receipt", () => {
  it("accepts a minimal receipt (latencyMs only)", () => {
    const r: Receipt = { latencyMs: 12 };
    expect(r.latencyMs).toBe(12);
  });

  it("accepts a full receipt", () => {
    const r: Receipt = {
      txHash: "0xabc",
      explorerUrl: "https://example/tx/0xabc",
      blockNumber: 99n,
      latencyMs: 5,
      attestation: { ok: true },
    };
    expect(r.blockNumber).toBe(99n);
    expect(r.txHash).toBe("0xabc");
  });

  it("rejects a receipt missing latencyMs (compile-time guard)", () => {
    // @ts-expect-error latencyMs is required; this line must not compile
    const _bad: Receipt = {};
    void _bad;
  });
});
