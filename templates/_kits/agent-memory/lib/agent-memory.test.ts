/**
 * Unit tests for the agent-memory portable core.
 *
 * Uses a pure in-memory mock for MemoryStorage — NO network, NO real 0gkit.
 * Run via: npx vitest run templates/_kits/agent-memory/lib/agent-memory.test.ts
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createMemory, type MemoryStorage } from "./agent-memory.js";

// ---------------------------------------------------------------------------
// Mock storage
// ---------------------------------------------------------------------------

function mockStorage(): MemoryStorage & { _blobs: Map<string, string> } {
  const _blobs = new Map<string, string>();
  return {
    _blobs,
    async putBlob(ns, data) {
      _blobs.set(ns, data);
    },
    async getBlob(ns) {
      return _blobs.get(ns);
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createMemory", () => {
  let storage: ReturnType<typeof mockStorage>;

  beforeEach(() => {
    storage = mockStorage();
  });

  it("returns remember / recall / list functions", () => {
    const mem = createMemory({ storage });
    expect(typeof mem.remember).toBe("function");
    expect(typeof mem.recall).toBe("function");
    expect(typeof mem.list).toBe("function");
  });

  it("list() returns empty array when nothing stored", async () => {
    const mem = createMemory({ storage });
    const entries = await mem.list();
    expect(entries).toEqual([]);
  });

  it("remember + list round-trip", async () => {
    const mem = createMemory({ storage });
    await mem.remember("user-name", "Alice");
    const entries = await mem.list();
    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe("user-name");
    expect(entries[0].value).toBe("Alice");
    expect(typeof entries[0].ts).toBe("number");
  });

  it("recall(query) returns entries matching key or value", async () => {
    const mem = createMemory({ storage });
    await mem.remember("user-name", "Alice");
    await mem.remember("project", "Foundry");
    await mem.remember("status", "active");

    const byKey = await mem.recall("project");
    expect(byKey).toHaveLength(1);
    expect(byKey[0].key).toBe("project");

    const byValue = await mem.recall("alice");
    expect(byValue).toHaveLength(1);
    expect(byValue[0].key).toBe("user-name");
  });

  it("recall('') returns all entries", async () => {
    const mem = createMemory({ storage });
    await mem.remember("a", "1");
    await mem.remember("b", "2");
    const all = await mem.recall("");
    expect(all).toHaveLength(2);
  });

  it("recall is case-insensitive", async () => {
    const mem = createMemory({ storage });
    await mem.remember("Greeting", "Hello World");
    const found = await mem.recall("HELLO");
    expect(found).toHaveLength(1);
    expect(found[0].key).toBe("Greeting");
  });

  it("deduplicate: multiple remember() for the same key yields one entry (latest wins)", async () => {
    const mem = createMemory({ storage });
    await mem.remember("color", "blue");
    await mem.remember("color", "red");
    const entries = await mem.list();
    expect(entries).toHaveLength(1);
    expect(entries[0].value).toBe("red");
  });

  it("namespaces are isolated", async () => {
    const memA = createMemory({ storage, namespace: "ns-a" });
    const memB = createMemory({ storage, namespace: "ns-b" });
    await memA.remember("key", "in-a");
    const fromB = await memB.recall("in-a");
    expect(fromB).toHaveLength(0);
  });

  it("persists across separate createMemory calls sharing the same storage", async () => {
    const mem1 = createMemory({ storage, namespace: "shared" });
    await mem1.remember("session", "abc");

    const mem2 = createMemory({ storage, namespace: "shared" });
    const found = await mem2.recall("abc");
    expect(found).toHaveLength(1);
    expect(found[0].key).toBe("session");
  });

  it("recall returns no match when query misses all entries", async () => {
    const mem = createMemory({ storage });
    await mem.remember("topic", "blockchain");
    const result = await mem.recall("xyz-nomatch");
    expect(result).toHaveLength(0);
  });
});
