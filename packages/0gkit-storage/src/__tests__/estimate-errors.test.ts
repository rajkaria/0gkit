import { describe, it, expect } from "vitest";
import { estimateBytes } from "../estimate.js";

describe("estimateBytes error codes", () => {
  it("throws STORAGE_INVALID_BYTES when sizeBytes is negative", () => {
    try {
      estimateBytes(-1);
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("STORAGE_INVALID_BYTES");
      expect((e as { helpUrl?: string }).helpUrl).toBe(
        "https://0gkit.com/errors/STORAGE_INVALID_BYTES"
      );
      expect(e instanceof Error).toBe(true);
    }
  });
});
