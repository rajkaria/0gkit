import { describe, it, expect } from "vitest";
import { BlockTracker } from "../block-tracker.js";

describe("BlockTracker error codes", () => {
  it("throws CONFIG_INVALID_ARGUMENT when depth < 1", () => {
    try {
      new BlockTracker({ depth: 0 });
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("CONFIG_INVALID_ARGUMENT");
      expect((e as { helpUrl?: string }).helpUrl).toBe(
        "https://0gkit.dev/errors/CONFIG_INVALID_ARGUMENT"
      );
      expect(e instanceof Error).toBe(true);
    }
  });
});
