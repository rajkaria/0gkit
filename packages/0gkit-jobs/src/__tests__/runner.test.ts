import { describe, expect, it } from "vitest";
import { z } from "zod";
import { testWallet } from "@foundryprotocol/0gkit-testing";
import { MemoryBackend } from "../backends/memory.js";
import { JobRunner } from "../runner.js";
import { jobs } from "../index.js";

const EchoJob = jobs.define({
  name: "echo",
  input: z.object({ text: z.string() }),
  output: z.object({ text: z.string(), ts: z.number() }),
  handler: async ({ input }) => ({ text: input.text, ts: Date.now() }),
});

const BoomJob = jobs.define({
  name: "boom",
  input: z.object({}),
  output: z.object({}),
  handler: async () => {
    throw new Error("kaboom");
  },
  maxAttempts: 2,
  backoffMs: () => 1,
});

describe("JobRunner", () => {
  it("processes a queued job end-to-end", async () => {
    const backend = new MemoryBackend();
    const runner = new JobRunner({ backend, signer: testWallet({ index: 0 }) });
    runner.register(EchoJob);
    const id = await runner.enqueue(EchoJob, { text: "hello" });
    await runner.start({ concurrency: 1 });
    const rec = await runner.waitFor(id, { timeoutMs: 2000 });
    await runner.stop();
    expect(rec.state).toBe("done");
    expect((rec.result as { text: string }).text).toBe("hello");
    expect((rec.result as { ts: number }).ts).toBeGreaterThan(0);
  });

  it("validates input via zod and refuses to enqueue invalid data", async () => {
    const backend = new MemoryBackend();
    const runner = new JobRunner({ backend, signer: testWallet({ index: 0 }) });
    runner.register(EchoJob);
    await expect(
      runner.enqueue(EchoJob, { text: 42 as unknown as string })
    ).rejects.toThrow();
  });

  it("retries a throwing handler up to maxAttempts then marks failed", async () => {
    const backend = new MemoryBackend();
    const runner = new JobRunner({ backend, signer: testWallet({ index: 0 }) });
    runner.register(BoomJob);
    const id = await runner.enqueue(BoomJob, {});
    await runner.start({ concurrency: 1 });
    const rec = await runner.waitFor(id, { timeoutMs: 2000 });
    await runner.stop();
    expect(rec.state).toBe("failed");
    expect(rec.metadata.attempts).toBe(2);
    expect(rec.error).toContain("kaboom");
  });

  it("supports graceful shutdown via stop({ drain: true })", async () => {
    const backend = new MemoryBackend();
    const runner = new JobRunner({ backend, signer: testWallet({ index: 0 }) });
    const SlowJob = jobs.define({
      name: "slow",
      input: z.unknown(),
      output: z.object({ ok: z.boolean() }),
      handler: async () => {
        await new Promise((r) => setTimeout(r, 50));
        return { ok: true };
      },
    });
    runner.register(SlowJob);
    const id = await runner.enqueue(SlowJob, {});
    await runner.start({ concurrency: 1 });
    await new Promise((r) => setTimeout(r, 10));
    await runner.stop({ drain: true, timeoutMs: 1000 });
    const rec = await backend.status(id);
    expect(rec?.state).toBe("done");
  });

  it("stop({ drain: false }) aborts in-flight jobs via the AbortSignal", async () => {
    const backend = new MemoryBackend();
    const runner = new JobRunner({ backend, signer: testWallet({ index: 0 }) });
    const SlowJob = jobs.define({
      name: "slow",
      input: z.unknown(),
      output: z.object({ ok: z.boolean() }),
      handler: async ({ signal }) => {
        await new Promise<void>((res, rej) => {
          const t = setTimeout(res, 5000);
          signal.addEventListener("abort", () => {
            clearTimeout(t);
            rej(new Error("aborted"));
          });
        });
        return { ok: true };
      },
      maxAttempts: 1,
    });
    runner.register(SlowJob);
    const id = await runner.enqueue(SlowJob, {});
    await runner.start({ concurrency: 1 });
    await new Promise((r) => setTimeout(r, 25));
    await runner.stop({ drain: false, timeoutMs: 500 });
    const rec = await backend.status(id);
    expect(rec?.state).toBe("failed");
    expect(rec?.error).toContain("aborted");
  });

  it("fails immediately when no definition is registered for the job name", async () => {
    const backend = new MemoryBackend();
    const runner = new JobRunner({ backend, signer: testWallet({ index: 0 }) });
    // Enqueue directly via backend to simulate a stale job for a removed definition.
    const id = await backend.enqueue("ghost", { x: 1 });
    await runner.start({ concurrency: 1 });
    const rec = await runner.waitFor(id, { timeoutMs: 1000 });
    await runner.stop();
    expect(rec.state).toBe("failed");
    expect(rec.error).toContain("no definition registered");
  });

  it("rejects a handler whose output fails the outputSchema", async () => {
    const backend = new MemoryBackend();
    const runner = new JobRunner({ backend, signer: testWallet({ index: 0 }) });
    const BadShape = jobs.define({
      name: "bad-shape",
      input: z.unknown(),
      output: z.object({ ok: z.literal(true) }),
      handler: async () => ({ ok: false }) as unknown as { ok: true },
      maxAttempts: 1,
      backoffMs: () => 1,
    });
    runner.register(BadShape);
    const id = await runner.enqueue(BadShape, {});
    await runner.start({ concurrency: 1 });
    const rec = await runner.waitFor(id, { timeoutMs: 1000 });
    await runner.stop();
    expect(rec.state).toBe("failed");
  });

  it("waitFor times out with JOBS_BACKEND_UNREACHABLE", async () => {
    const backend = new MemoryBackend();
    const runner = new JobRunner({ backend, signer: testWallet({ index: 0 }) });
    await expect(
      runner.waitFor("missing", { timeoutMs: 50, pollMs: 10 })
    ).rejects.toMatchObject({ code: "JOBS_BACKEND_UNREACHABLE" });
  });

  it("hasDefinition reflects register()", async () => {
    const backend = new MemoryBackend();
    const runner = new JobRunner({ backend, signer: testWallet({ index: 0 }) });
    expect(runner.hasDefinition("echo")).toBe(false);
    runner.register(EchoJob);
    expect(runner.hasDefinition("echo")).toBe(true);
  });
});
