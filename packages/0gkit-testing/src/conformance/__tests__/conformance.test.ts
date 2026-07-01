import { describe, it, expect } from "vitest";
import { storageSuite } from "../storage.js";
import { mockStorageClient } from "../../mocks/storage.js";

describe("storageSuite", () => {
  it("round-trips 1KB and asserts byte-equality", async () => {
    const storage = mockStorageClient();
    const result = await storageSuite({ makeStorage: () => storage });
    expect(result.ok).toBe(true);
    expect(result.name).toBe("storage");
    expect(result.detail).toContain("1024 bytes");
  });
});
