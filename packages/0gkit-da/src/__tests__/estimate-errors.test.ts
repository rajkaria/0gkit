import { describe, it, expect } from "vitest";
import { estimateBytes } from "../estimate.js";

describe("estimateBytes (DA) error codes", () => {
  it("throws DA_INVALID_PAYLOAD when sizeBytes is negative", () => {
    try {
      estimateBytes(-1);
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("DA_INVALID_PAYLOAD");
      expect((e as { helpUrl?: string }).helpUrl).toBe(
        "https://0gkit.com/errors/DA_INVALID_PAYLOAD"
      );
      expect(e instanceof Error).toBe(true);
    }
  });
});
