import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteCursorStore } from "../cursors/sqlite.js";
import type { CursorState } from "../types.js";

const sample: CursorState = {
  lastBlock: 12345n,
  recentBlocks: [
    {
      number: 12345n,
      hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
  ],
};

const created: string[] = [];
function tempDb(): string {
  const dir = mkdtempSync(join(tmpdir(), "indexer-sqlite-"));
  created.push(dir);
  return join(dir, "cursor.db");
}
afterEach(() => {
  for (const d of created.splice(0))
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
});

describe("SqliteCursorStore", () => {
  it("returns null when key absent", async () => {
    const s = new SqliteCursorStore({ path: tempDb() });
    expect(await s.load("sub-1")).toBeNull();
    await s.close();
  });

  it("save + load preserves bigints", async () => {
    const s = new SqliteCursorStore({ path: tempDb() });
    await s.save("sub-1", sample);
    const out = await s.load("sub-1");
    expect(out).toEqual(sample);
    expect(typeof out!.lastBlock).toBe("bigint");
    expect(typeof out!.recentBlocks[0]!.number).toBe("bigint");
    await s.close();
  });

  it("state survives close + reopen on the same path", async () => {
    const path = tempDb();
    const a = new SqliteCursorStore({ path });
    await a.save("sub-1", sample);
    await a.close();
    const b = new SqliteCursorStore({ path });
    const out = await b.load("sub-1");
    expect(out).toEqual(sample);
    await b.close();
  });

  it("overwrites prior state", async () => {
    const s = new SqliteCursorStore({ path: tempDb() });
    await s.save("sub-1", sample);
    const next: CursorState = { lastBlock: 99999n, recentBlocks: [] };
    await s.save("sub-1", next);
    expect(await s.load("sub-1")).toEqual(next);
    await s.close();
  });
});
