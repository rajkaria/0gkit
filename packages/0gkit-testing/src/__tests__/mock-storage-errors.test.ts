import { describe, it, expect } from "vitest";
import { mockStorageClient } from "../mocks/storage.js";

describe("mockStorageClient error codes", () => {
  it("throws STORAGE_ROOT_NOT_FOUND when downloading an unknown root", async () => {
    const c = mockStorageClient();
    try {
      await c.download("0xdeadbeef");
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("STORAGE_ROOT_NOT_FOUND");
      expect((e as { helpUrl?: string }).helpUrl).toBe(
        "https://0gkit.dev/errors/STORAGE_ROOT_NOT_FOUND"
      );
      expect(e instanceof Error).toBe(true);
    }
  });
});
