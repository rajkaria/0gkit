import { ZeroGError } from "@foundryprotocol/0gkit-core";
import type { JobBackend, JobRecord } from "../types.js";

interface RedisOpts {
  url: string;
  keyPrefix?: string;
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

type RedisLike = {
  set: (key: string, value: string) => Promise<unknown>;
  get: (key: string) => Promise<string | null>;
  rpush: (key: string, value: string) => Promise<unknown>;
  lpop: (key: string) => Promise<string | null>;
  lrem: (key: string, count: number, value: string) => Promise<unknown>;
  quit: () => Promise<unknown>;
};

async function loadIoredis(): Promise<new (url: string) => RedisLike> {
  try {
    // Computed specifier so the dep graph stays clean and the peer is truly optional.
    const mod = (await import(["ioredis"].join("/"))) as {
      default?: new (url: string) => RedisLike;
      Redis?: new (url: string) => RedisLike;
    };
    const Ctor = mod.default ?? mod.Redis;
    if (!Ctor) {
      throw new Error("ioredis loaded but no Redis constructor found");
    }
    return Ctor;
  } catch {
    throw new ZeroGError(
      "JOBS_BACKEND_UNREACHABLE",
      "ioredis is not installed — the redis JobBackend requires it as an optional peer.",
      "run `pnpm add ioredis` (or `npm install ioredis`) in your project, then retry."
    );
  }
}

export class RedisBackend implements JobBackend {
  private client!: RedisLike;
  private keyPrefix: string;
  private ready: Promise<void>;

  constructor(opts: RedisOpts) {
    this.keyPrefix = opts.keyPrefix ?? "0gkit:jobs";
    this.ready = (async () => {
      const Redis = await loadIoredis();
      this.client = new Redis(opts.url);
    })();
  }

  private k(rest: string): string {
    return `${this.keyPrefix}:${rest}`;
  }

  async enqueue<I>(name: string, input: I): Promise<string> {
    await this.ready;
    const jobId = makeId();
    const rec: JobRecord<I, unknown> = {
      id: jobId,
      name,
      state: "queued",
      input,
      metadata: { attempts: 0, createdAt: Date.now() },
    };
    await this.client.set(this.k(`rec:${jobId}`), JSON.stringify(rec));
    await this.client.rpush(this.k("q"), jobId);
    return jobId;
  }

  async claim(): Promise<JobRecord | null> {
    await this.ready;
    const jobId = await this.client.lpop(this.k("q"));
    if (!jobId) return null;
    const raw = await this.client.get(this.k(`rec:${jobId}`));
    if (!raw) return null;
    const rec = JSON.parse(raw) as JobRecord;
    if (rec.state !== "queued") return null;
    rec.state = "running";
    rec.metadata.attempts += 1;
    rec.metadata.startedAt = Date.now();
    await this.client.set(this.k(`rec:${jobId}`), JSON.stringify(rec));
    return rec;
  }

  async complete<O>(jobId: string, result: O): Promise<void> {
    await this.ready;
    const raw = await this.client.get(this.k(`rec:${jobId}`));
    if (!raw) {
      throw new ZeroGError(
        "JOBS_JOB_NOT_FOUND",
        `job ${jobId} not found`,
        "verify the id"
      );
    }
    const rec = JSON.parse(raw) as JobRecord;
    rec.state = "done";
    rec.result = result;
    rec.metadata.finishedAt = Date.now();
    await this.client.set(this.k(`rec:${jobId}`), JSON.stringify(rec));
  }

  async fail(jobId: string, error: string, retry: boolean): Promise<void> {
    await this.ready;
    const raw = await this.client.get(this.k(`rec:${jobId}`));
    if (!raw) {
      throw new ZeroGError(
        "JOBS_JOB_NOT_FOUND",
        `job ${jobId} not found`,
        "verify the id"
      );
    }
    const rec = JSON.parse(raw) as JobRecord;
    rec.metadata.lastError = error;
    rec.metadata.finishedAt = Date.now();
    if (retry) {
      rec.state = "queued";
      rec.metadata.startedAt = undefined;
      await this.client.set(this.k(`rec:${jobId}`), JSON.stringify(rec));
      await this.client.rpush(this.k("q"), jobId);
    } else {
      rec.state = "failed";
      rec.error = error;
      await this.client.set(this.k(`rec:${jobId}`), JSON.stringify(rec));
    }
  }

  async cancel(jobId: string): Promise<void> {
    await this.ready;
    const raw = await this.client.get(this.k(`rec:${jobId}`));
    if (!raw) {
      throw new ZeroGError(
        "JOBS_JOB_NOT_FOUND",
        `job ${jobId} not found`,
        "verify the id"
      );
    }
    const rec = JSON.parse(raw) as JobRecord;
    if (rec.state === "queued" || rec.state === "running") {
      rec.state = "cancelled";
      rec.metadata.finishedAt = Date.now();
      await this.client.set(this.k(`rec:${jobId}`), JSON.stringify(rec));
      await this.client.lrem(this.k("q"), 0, jobId);
    }
  }

  async status(jobId: string): Promise<JobRecord | null> {
    await this.ready;
    const raw = await this.client.get(this.k(`rec:${jobId}`));
    return raw ? (JSON.parse(raw) as JobRecord) : null;
  }

  async close(): Promise<void> {
    await this.ready;
    await this.client.quit();
  }
}
