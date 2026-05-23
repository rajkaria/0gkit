import { describe, it, expect } from "vitest";
import { mockStorageClient, mockComputeClient, mockDAClient } from "../mocks/index.js";

describe("mockStorageClient", () => {
  it("upload→download round-trip with deterministic root", async () => {
    const s = mockStorageClient();
    const data = new TextEncoder().encode("hello 0g");
    const result = await s.upload(data);
    expect(result.root).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.tx.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(await s.exists(result.root)).toBe(true);
    expect(new TextDecoder().decode(await s.download(result.root))).toBe("hello 0g");
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

  it("estimate(data) returns a shape-compatible StorageEstimate", async () => {
    const s = mockStorageClient();
    const est = await s.estimate(new Uint8Array(300_000)); // > 256 KiB → 2 segments
    expect(est.kind).toBe("storage");
    expect(est.breakdown.segments).toBe(2);
    expect(est.breakdown.sizeBytes).toBe(300_000);
    expect(est.gas).toBeGreaterThan(0n);
    expect(est.fee).toBe(2n * 1_000_000_000n);
  });

  it("estimate(empty) reports zero segments", async () => {
    const s = mockStorageClient();
    const est = await s.estimate(new Uint8Array(0));
    expect(est.breakdown.segments).toBe(0);
    expect(est.fee).toBe(0n);
  });

  it("upload with { dryRun: true } returns a DryRunResult and skips the store", async () => {
    const s = mockStorageClient();
    const data = new TextEncoder().encode("dry");
    const dr = await s.upload(data, { dryRun: true });
    expect(dr.dryRun).toBe(true);
    expect(dr.estimate.kind).toBe("storage");
    expect(dr.result.root).toMatch(/^0x[0-9a-f]{64}$/);
    expect(dr.result.tx.txHash).toBeUndefined();
    expect(s.__store().size).toBe(0);
    expect(await s.exists(dr.result.root)).toBe(false);
  });
});

describe("mockComputeClient", () => {
  it("inference echoes the last user message by default", async () => {
    const c = mockComputeClient();
    const reply = await c.inference({
      messages: [
        { role: "system", content: "you are a test" },
        { role: "user", content: "ping" },
      ],
    });
    expect(reply.output).toBe("echo: ping");
    expect(reply.receipt.txHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("supports a custom responder", async () => {
    const c = mockComputeClient({
      responder: (msgs) => `seen ${msgs.length} message(s)`,
    });
    const r = await c.inference({ messages: [{ role: "user", content: "x" }] });
    expect(r.output).toBe("seen 1 message(s)");
  });

  it("returns a stable provider list from listProviders()", async () => {
    const c = mockComputeClient();
    const providers = await c.listProviders();
    expect(providers).toHaveLength(2);
    expect(providers[0]).toMatchObject({ id: "mock-provider-0" });
  });

  it("tracks call count for live inferences only", async () => {
    const c = mockComputeClient();
    expect(c.__callCount()).toBe(0);
    await c.inference({ messages: [{ role: "user", content: "a" }] });
    await c.inference({ messages: [{ role: "user", content: "b" }] });
    await c.inference(
      { messages: [{ role: "user", content: "skip-me" }] },
      { dryRun: true }
    );
    expect(c.__callCount()).toBe(2);
  });

  it("handles the no-user-message case gracefully", async () => {
    const c = mockComputeClient();
    const reply = await c.inference({
      messages: [{ role: "system", content: "noop" }],
    });
    expect(reply.output).toContain("no user message");
  });

  it("estimate({messages, ...}) returns a ComputeEstimate", async () => {
    const c = mockComputeClient();
    const est = await c.estimate({
      messages: [{ role: "user", content: "hello world" }],
      model: "test-model",
      maxOutputTokens: 100,
    });
    expect(est.kind).toBe("compute");
    expect(est.breakdown.inputTokens).toBe(Math.ceil("hello world".length / 4));
    expect(est.breakdown.outputTokensMax).toBe(100);
    expect(est.breakdown.model).toBe("test-model");
    expect(est.fee).toBeGreaterThan(0n);
  });

  it("inference with { dryRun: true } returns a DryRunResult without invoking the responder", async () => {
    let called = 0;
    const c = mockComputeClient({
      responder: () => {
        called++;
        return "should not run";
      },
    });
    const dr = await c.inference(
      { messages: [{ role: "user", content: "dry" }] },
      { dryRun: true }
    );
    expect(dr.dryRun).toBe(true);
    expect(dr.estimate.kind).toBe("compute");
    expect(dr.result.output).toBe("");
    expect(called).toBe(0);
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
