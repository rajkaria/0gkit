import { describe, it, expect } from "vitest";
import "@foundryprotocol/0gkit-testing/matchers";
import { fixtureReceipt } from "@foundryprotocol/0gkit-testing";

describe("@foundryprotocol/0gkit-testing — fixtureReceipt + matchers (CLI surface)", () => {
  it("default fixtureReceipt passes toBeConfirmedOn0G", () => {
    expect(fixtureReceipt()).toBeConfirmedOn0G();
  });

  it("overrides flow through to the shape consumers assert on", () => {
    const r = fixtureReceipt({ blockNumber: 12345n, latencyMs: 7 });
    expect(r.blockNumber).toBe(12345n);
    expect(r.latencyMs).toBe(7);
    expect(r).toBeConfirmedOn0G();
  });
});
