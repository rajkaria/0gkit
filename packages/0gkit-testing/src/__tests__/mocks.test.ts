import { describe, it, expect } from "vitest";
import { mockStorageClient, mockComputeClient, mockDAClient } from "../mocks/index.js";

describe("mockStorageClient", () => {
  it("upload→download round-trip with deterministic root", async () => {
    const s = mockStorageClient();
    const data = new TextEncoder().encode("hello 0g");
    const { root, tx } = await s.upload(data);
    expect(root).toMatch(/^0x[0-9a-f]{64}$/);
    expect(tx.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(await s.exists(root)).toBe(true);
    expect(new TextDecoder().decode(await s.download(root))).toBe("hello 0g");
  });

  it("same input → same root", async () => {
    const s = mockStorageClient();
    const data = new TextEncoder().encode("same");
    const a = await s.upload(data);
    const b = await s.upload(data);
    expect(a.root).toBe(b.root);
  });

  it("download throws when root is unknown", async () => {
    const s = mockStorageClient();
    await expect(s.download("0x" + "00".repeat(32))).rejects.toThrow(/not found/);
  });

  it("respects the tx override", async () => {
    const s = mockStorageClient({ txOverride: { blockNumber: 42n } });
    const { tx } = await s.upload(new Uint8Array([1, 2, 3]));
    expect(tx.blockNumber).toBe(42n);
  });

  it("exposes the internal store for inspection", async () => {
    const s = mockStorageClient();
    await s.upload(new Uint8Array([1]));
    expect(s.__store().size).toBe(1);
  });
});

describe("mockComputeClient", () => {
  it("echoes the last user message by default", async () => {
    const c = mockComputeClient();
    const reply = await c.chat([
      { role: "system", content: "you are a test" },
      { role: "user", content: "ping" },
    ]);
    expect(reply.role).toBe("assistant");
    expect(reply.content).toBe("echo: ping");
    expect(reply.tx.txHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("supports a custom responder", async () => {
    const c = mockComputeClient({
      responder: (msgs) => `seen ${msgs.length} message(s)`,
    });
    const r = await c.chat([{ role: "user", content: "x" }]);
    expect(r.content).toBe("seen 1 message(s)");
  });

  it("returns a stable provider list from discover()", async () => {
    const c = mockComputeClient();
    const { providers } = await c.discover();
    expect(providers).toHaveLength(2);
    expect(providers[0]).toMatchObject({ id: "mock-provider-0" });
  });

  it("tracks call count", async () => {
    const c = mockComputeClient();
    expect(c.__callCount()).toBe(0);
    await c.chat([{ role: "user", content: "a" }]);
    await c.chat([{ role: "user", content: "b" }]);
    expect(c.__callCount()).toBe(2);
  });

  it("handles the no-user-message case gracefully", async () => {
    const c = mockComputeClient();
    const reply = await c.chat([{ role: "system", content: "noop" }]);
    expect(reply.content).toContain("no user message");
  });
});

describe("mockDAClient", () => {
  it("publishes + verifies the original bytes", async () => {
    const d = mockDAClient();
    const bytes = new TextEncoder().encode("payload");
    const { digest } = await d.publish(bytes);
    expect(digest).toMatch(/^0x[0-9a-f]{64}$/);
    expect(await d.verify(digest, bytes)).toBe(true);
  });

  it("detects tampered bytes", async () => {
    const d = mockDAClient();
    const bytes = new TextEncoder().encode("trusted");
    const { digest } = await d.publish(bytes);
    const tampered = new TextEncoder().encode("trusted!");
    expect(await d.verify(digest, tampered)).toBe(false);
  });

  it("returns false for unknown digests", async () => {
    const d = mockDAClient();
    const result = await d.verify("0x" + "00".repeat(32), new Uint8Array([1]));
    expect(result).toBe(false);
  });

  it("returns false on length mismatch even when digest collides", async () => {
    const d = mockDAClient();
    const a = new Uint8Array([1, 2, 3, 4]);
    const { digest } = await d.publish(a);
    const same = new Uint8Array([1, 2, 3, 4, 5]); // longer
    expect(await d.verify(digest, same)).toBe(false);
  });
});
