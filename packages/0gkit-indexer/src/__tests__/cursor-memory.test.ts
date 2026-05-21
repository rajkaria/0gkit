import { describe, it, expect } from "vitest";
import { MemoryCursorStore } from "../cursors/memory.js";
import type { CursorState } from "../types.js";

const sample: CursorState = {
  lastBlock: 100n,
  recentBlocks: [
    {
      number: 99n,
      hash: "0x9999999999999999999999999999999999999999999999999999999999999999",
    },
    {
      number: 100n,
      hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
  ],
};

describe("MemoryCursorStore", () => {
  it("returns null when key absent", async () => {
    const s = new MemoryCursorStore();
    expect(await s.load("sub-1")).toBeNull();
  });

  it("save + load round-trips", async () => {
    const s = new MemoryCursorStore();
    await s.save("sub-1", sample);
    const out = await s.load("sub-1");
    expect(out).toEqual(sample);
  });

  it("save overwrites prior state", async () => {
    const s = new MemoryCursorStore();
    await s.save("sub-1", sample);
    const next: CursorState = { lastBlock: 101n, recentBlocks: [] };
    await s.save("sub-1", next);
    expect(await s.load("sub-1")).toEqual(next);
  });

  it("isolates keys", async () => {
    const s = new MemoryCursorStore();
    await s.save("a", sample);
    expect(await s.load("b")).toBeNull();
  });

  it("returns a structural copy (mutating the loaded value doesn't poison the store)", async () => {
    const s = new MemoryCursorStore();
    await s.save("sub-1", sample);
    const out = await s.load("sub-1");
    out!.lastBlock = 999n;
    const out2 = await s.load("sub-1");
    expect(out2!.lastBlock).toBe(100n);
  });
});
