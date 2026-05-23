// Tests for the percentile + summarize helpers in bench-cli-coldstart.mjs.
// Run via: `node --test scripts/__tests__/bench-cli-coldstart.test.mjs`
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { percentile, summarize } from "../bench-cli-coldstart.mjs";

describe("percentile", () => {
  it("returns 0 for an empty sample", () => {
    assert.equal(percentile([], 50), 0);
  });

  it("returns the max for p100", () => {
    assert.equal(percentile([1, 2, 3, 4, 5], 100), 5);
  });

  it("returns the median for p50 on a sorted 5-sample input", () => {
    assert.equal(percentile([1, 2, 3, 4, 5], 50), 3);
  });

  it("never indexes past the end of the sample", () => {
    assert.equal(percentile([10, 20], 99), 20);
  });
});

describe("summarize", () => {
  it("computes p50/p95/min/max/mean from a sample", () => {
    const stats = summarize([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
    assert.equal(stats.min, 100);
    assert.equal(stats.max, 1000);
    assert.equal(stats.p50, 500);
    // ceil(0.95 * 10) = 10 → index 9 → 1000
    assert.equal(stats.p95, 1000);
    assert.equal(stats.mean, 550);
  });

  it("handles a single-sample input", () => {
    const stats = summarize([42]);
    assert.equal(stats.p50, 42);
    assert.equal(stats.p95, 42);
    assert.equal(stats.max, 42);
    assert.equal(stats.min, 42);
    assert.equal(stats.mean, 42);
  });

  it("returns zeros for an empty input", () => {
    const stats = summarize([]);
    assert.equal(stats.p50, 0);
    assert.equal(stats.p95, 0);
    assert.equal(stats.max, 0);
    assert.equal(stats.min, 0);
    assert.equal(stats.mean, 0);
  });

  it("does not mutate the input array", () => {
    const samples = [3, 1, 2];
    summarize(samples);
    assert.deepEqual(samples, [3, 1, 2]);
  });
});
