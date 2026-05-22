import { describe, it, expect } from "vitest";
import { RedisCursorStore } from "../cursors/redis.js";

describe("RedisCursorStore error codes", () => {
  it("throws INDEXER_CURSOR_BACKEND_UNREACHABLE when neither client nor url is provided", () => {
    try {
      new RedisCursorStore({});
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("INDEXER_CURSOR_BACKEND_UNREACHABLE");
      expect((e as { helpUrl?: string }).helpUrl).toBe(
        "https://0gkit.dev/errors/INDEXER_CURSOR_BACKEND_UNREACHABLE"
      );
      expect(e instanceof Error).toBe(true);
    }
  });
});
