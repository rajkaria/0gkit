import { describe, it, expect } from "vitest";
import { canonicalJsonStringify, digestJson } from "../canonical.js";

describe("canonicalJsonStringify", () => {
  it("sorts object keys recursively and is whitespace-free", () => {
    const a = canonicalJsonStringify({ b: 1, a: { d: 4, c: 3 } });
    const b = canonicalJsonStringify({ a: { c: 3, d: 4 }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":{"c":3,"d":4},"b":1}');
  });

  it("preserves array order", () => {
    expect(canonicalJsonStringify([3, 1, 2])).toBe("[3,1,2]");
  });

  it("sorts keys recursively inside array elements", () => {
    expect(canonicalJsonStringify([{ b: 2, a: 1 }])).toBe('[{"a":1,"b":2}]');
  });

  it("handles primitives and null", () => {
    expect(canonicalJsonStringify("x")).toBe('"x"');
    expect(canonicalJsonStringify(null)).toBe("null");
    expect(canonicalJsonStringify(42)).toBe("42");
  });
});

describe("digestJson", () => {
  it("is a 0x keccak256 hex stable under key reordering", () => {
    const d1 = digestJson({ b: 2, a: 1 });
    const d2 = digestJson({ a: 1, b: 2 });
    expect(d1).toBe(d2);
    expect(d1).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("changes when a value changes", () => {
    expect(digestJson({ a: 1 })).not.toBe(digestJson({ a: 2 }));
  });
});
