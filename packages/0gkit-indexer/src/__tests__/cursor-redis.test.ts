// packages/0gkit-indexer/src/__tests__/cursor-redis.test.ts
import { describe, it, expect, afterEach } from "vitest";
import type { CursorState } from "../types.js";

const REDIS_URL = process.env.REDIS_URL;
const describeIf = REDIS_URL ? describe : describe.skip;

const sample: CursorState = {
  lastBlock: 555n,
  recentBlocks: [
    {
      number: 555n,
      hash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    },
  ],
};

describeIf("RedisCursorStore (gated on REDIS_URL)", () => {
  const ns = `0gkit-indexer-test-${Date.now()}`;
  let store: import("../cursors/redis.js").RedisCursorStore;

  afterEach(async () => {
    if (store) await store.close();
  });

  it("returns null when key absent", async () => {
    const { RedisCursorStore } = await import("../cursors/redis.js");
    store = new RedisCursorStore({ url: REDIS_URL!, namespace: ns });
    expect(await store.load("absent")).toBeNull();
  });

  it("save + load round-trips bigints", async () => {
    const { RedisCursorStore } = await import("../cursors/redis.js");
    store = new RedisCursorStore({ url: REDIS_URL!, namespace: ns });
    await store.save("sub-1", sample);
    expect(await store.load("sub-1")).toEqual(sample);
  });
});
