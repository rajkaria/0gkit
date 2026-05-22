import { describe, expect, it } from "vitest";
import { ATTR } from "../attributes.js";

describe("ATTR", () => {
  it("uses the 0gkit.* namespace for every key", () => {
    for (const key of Object.values(ATTR)) {
      expect(key).toMatch(/^0gkit\./);
    }
  });

  it("defines the canonical set of keys", () => {
    expect(Object.keys(ATTR).sort()).toEqual(
      [
        "NETWORK",
        "OP",
        "SIZE_BYTES",
        "SEGMENTS",
        "GAS_NATIVE",
        "FEE_NATIVE",
        "CONFIRM_SECONDS",
        "ROOT",
        "TX_HASH",
        "BLOCK_NUMBER",
        "MODEL",
        "INPUT_TOKENS",
        "OUTPUT_TOKENS",
        "ERROR_CODE",
        "DRY_RUN",
      ].sort()
    );
  });

  it("is frozen", () => {
    expect(Object.isFrozen(ATTR)).toBe(true);
  });

  it("each constant value is unique", () => {
    const values = Object.values(ATTR);
    expect(new Set(values).size).toBe(values.length);
  });
});
