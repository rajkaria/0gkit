import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryBackend } from "../backends/memory.js";
import { SqliteBackend } from "../backends/sqlite.js";
import type { JobBackend } from "../types.js";

interface Factory {
  name: string;
  make: () => Promise<{ backend: JobBackend; cleanup: () => Promise<void> }>;
}

const factories: Factory[] = [
  {
    name: "memory",
    make: async () => {
      const backend = new MemoryBackend();
      return { backend, cleanup: async () => backend.close() };
    },
  },
  {
    name: "sqlite",
    make: async () => {
      const dir = mkdtempSync(join(tmpdir(), "jobs-sqlite-"));
      const backend = new SqliteBackend({ path: join(dir, "jobs.db") });
      return {
        backend,
        cleanup: async () => {
          await backend.close();
          rmSync(dir, { recursive: true, force: true });
        },
      };
    },
  },
];

const REDIS_URL = process.env.JOBS_TEST_REDIS_URL;
if (REDIS_URL) {
  factories.push({
    name: "redis",
    make: async () => {
      const { RedisBackend } = await import("../backends/redis.js");
      const backend = new RedisBackend({
        url: REDIS_URL,
        keyPrefix: `0gkit:test:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      });
      return { backend, cleanup: async () => backend.close() };
    },
  });
}

describe.each(factories)("JobBackend conformance: $name", ({ make }) => {
  let backend: JobBackend;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ backend, cleanup } = await make());
  });
  afterEach(async () => cleanup());

  it("enqueue returns a stable id and status returns the same record", async () => {
    const id = await backend.enqueue("test", { x: 1 });
    expect(id).toMatch(/^[a-z0-9-]{10,}$/);
    const rec = await backend.status(id);
    expect(rec).toMatchObject({ id, name: "test", state: "queued", input: { x: 1 } });
    expect(rec?.metadata.attempts).toBe(0);
    expect(rec?.metadata.createdAt).toBeGreaterThan(0);
  });

  it("claim picks the oldest queued job and marks it running", async () => {
    const a = await backend.enqueue("test", { n: 1 });
    await new Promise((r) => setTimeout(r, 5));
    const b = await backend.enqueue("test", { n: 2 });
    const claimed = await backend.claim({ workerId: "w1" });
    expect(claimed?.id).toBe(a);
    expect(claimed?.state).toBe("running");
    expect(claimed?.metadata.startedAt).toBeGreaterThan(0);
    expect(claimed?.metadata.attempts).toBe(1);
    const next = await backend.claim({ workerId: "w1" });
    expect(next?.id).toBe(b);
  });

  it("claim returns null when no queued jobs remain", async () => {
    expect(await backend.claim({ workerId: "w1" })).toBeNull();
  });

  it("complete moves running -> done with result", async () => {
    const id = await backend.enqueue("test", { n: 1 });
    await backend.claim({ workerId: "w1" });
    await backend.complete(id, { ok: true });
    const rec = await backend.status(id);
    expect(rec?.state).toBe("done");
    expect(rec?.result).toEqual({ ok: true });
    expect(rec?.metadata.finishedAt).toBeGreaterThan(0);
  });

  it("fail with retry=false moves to failed", async () => {
    const id = await backend.enqueue("test", { n: 1 });
    await backend.claim({ workerId: "w1" });
    await backend.fail(id, "boom", false);
    const rec = await backend.status(id);
    expect(rec?.state).toBe("failed");
    expect(rec?.error).toBe("boom");
  });

  it("fail with retry=true requeues the job", async () => {
    const id = await backend.enqueue("test", { n: 1 });
    await backend.claim({ workerId: "w1" });
    await backend.fail(id, "transient", true);
    const rec = await backend.status(id);
    expect(rec?.state).toBe("queued");
    expect(rec?.metadata.lastError).toBe("transient");
    const reclaim = await backend.claim({ workerId: "w1" });
    expect(reclaim?.id).toBe(id);
  });

  it("cancel a queued job moves to cancelled", async () => {
    const id = await backend.enqueue("test", { n: 1 });
    await backend.cancel(id);
    expect((await backend.status(id))?.state).toBe("cancelled");
    expect(await backend.claim({ workerId: "w1" })).toBeNull();
  });

  it("status returns null for unknown id", async () => {
    expect(await backend.status("nope")).toBeNull();
  });

  it("complete/fail/cancel throw JOBS_JOB_NOT_FOUND for unknown ids", async () => {
    await expect(backend.complete("ghost", { ok: 1 })).rejects.toMatchObject({
      code: "JOBS_JOB_NOT_FOUND",
    });
    await expect(backend.fail("ghost", "nope", false)).rejects.toMatchObject({
      code: "JOBS_JOB_NOT_FOUND",
    });
    await expect(backend.cancel("ghost")).rejects.toMatchObject({
      code: "JOBS_JOB_NOT_FOUND",
    });
  });

  it("cancel is a no-op for terminal-state jobs", async () => {
    const id = await backend.enqueue("test", { n: 1 });
    await backend.claim({ workerId: "w1" });
    await backend.complete(id, { ok: true });
    await backend.cancel(id);
    expect((await backend.status(id))?.state).toBe("done");
  });
});
