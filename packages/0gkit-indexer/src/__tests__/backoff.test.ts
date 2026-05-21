import { describe, it, expect } from "vitest";
import { expBackoffWithJitter } from "../backoff.js";

describe("expBackoffWithJitter", () => {
  it("returns a non-negative number for attempt 0", () => {
    const d = expBackoffWithJitter(0, { rng: () => 0.5 });
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThanOrEqual(1000);
  });

  it("grows exponentially with attempt count", () => {
    const d0 = expBackoffWithJitter(0, { rng: () => 1 });
    const d3 = expBackoffWithJitter(3, { rng: () => 1 });
    expect(d3).toBeGreaterThan(d0 * 4);
  });

  it("caps at maxMs", () => {
    const d = expBackoffWithJitter(30, { rng: () => 1, maxMs: 5000 });
    expect(d).toBeLessThanOrEqual(5000);
  });

  it("with rng=0 returns the base delay (no jitter)", () => {
    expect(expBackoffWithJitter(2, { rng: () => 0, baseMs: 100 })).toBe(400);
  });

  it("with rng=1 returns 2x base (full jitter band)", () => {
    expect(expBackoffWithJitter(2, { rng: () => 1, baseMs: 100 })).toBe(800);
  });
});
