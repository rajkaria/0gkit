import { describe, it, expect } from "vitest";
import { BlockTracker } from "../block-tracker.js";

const h = (n: number): `0x${string}` =>
  ("0x" + n.toString(16).padStart(64, "0")) as `0x${string}`;

describe("BlockTracker", () => {
  it("starts empty", () => {
    const t = new BlockTracker({ depth: 4 });
    expect(t.size).toBe(0);
    expect(t.head()).toBeNull();
  });

  it("push appends in chain order and returns head", () => {
    const t = new BlockTracker({ depth: 4 });
    t.push({ number: 10n, hash: h(10) });
    t.push({ number: 11n, hash: h(11) });
    expect(t.size).toBe(2);
    expect(t.head()).toEqual({ number: 11n, hash: h(11) });
  });

  it("evicts the oldest block past depth", () => {
    const t = new BlockTracker({ depth: 2 });
    t.push({ number: 1n, hash: h(1) });
    t.push({ number: 2n, hash: h(2) });
    t.push({ number: 3n, hash: h(3) });
    expect(t.size).toBe(2);
    expect(t.snapshot()).toEqual([
      { number: 2n, hash: h(2) },
      { number: 3n, hash: h(3) },
    ]);
  });

  it("findCommonAncestor returns null when chains diverge before window", () => {
    const t = new BlockTracker({ depth: 4 });
    t.push({ number: 10n, hash: h(10) });
    t.push({ number: 11n, hash: h(11) });
    const ancestor = t.findCommonAncestor([
      { number: 10n, hash: h(999) },
      { number: 11n, hash: h(888) },
    ]);
    expect(ancestor).toBeNull();
  });

  it("findCommonAncestor returns highest matching block", () => {
    const t = new BlockTracker({ depth: 4 });
    t.push({ number: 10n, hash: h(10) });
    t.push({ number: 11n, hash: h(11) });
    t.push({ number: 12n, hash: h(12) });
    const ancestor = t.findCommonAncestor([
      { number: 10n, hash: h(10) },
      { number: 11n, hash: h(11) },
      { number: 12n, hash: h(99) },
    ]);
    expect(ancestor).toEqual({ number: 11n, hash: h(11) });
  });

  it("hydrate replaces window with the given snapshot", () => {
    const t = new BlockTracker({ depth: 4 });
    t.hydrate([
      { number: 5n, hash: h(5) },
      { number: 6n, hash: h(6) },
    ]);
    expect(t.size).toBe(2);
    expect(t.head()).toEqual({ number: 6n, hash: h(6) });
  });

  it("hydrate trims to depth", () => {
    const t = new BlockTracker({ depth: 2 });
    t.hydrate([
      { number: 1n, hash: h(1) },
      { number: 2n, hash: h(2) },
      { number: 3n, hash: h(3) },
    ]);
    expect(t.size).toBe(2);
    expect(t.head()?.number).toBe(3n);
  });
});
