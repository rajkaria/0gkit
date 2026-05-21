import { describe, it, expect } from "vitest";
import { mockStorageClient } from "@foundryprotocol/0gkit-testing";

/**
 * Migrated suite: exercises the public Storage-shaped surface via the
 * `mockStorageClient` from `@foundryprotocol/0gkit-testing`. Proves the mock
 * API matches what callers of `new Storage(...)` actually use.
 */
describe("@foundryprotocol/0gkit-testing — mockStorageClient (Storage surface)", () => {
  it("upload→download round-trips and exists() reports membership", async () => {
    const s = mockStorageClient();
    const data = new TextEncoder().encode("hello via testing pkg");
    const { root, tx } = await s.upload(data);
    expect(root).toMatch(/^0x[0-9a-f]{64}$/);
    expect(tx.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(await s.exists(root)).toBe(true);
    const back = await s.download(root);
    expect(new TextDecoder().decode(back)).toBe("hello via testing pkg");
  });
});
