import { ZeroGError } from "@foundryprotocol/0gkit-core";
import type { JobBackend, JobRecord } from "../types.js";

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class MemoryBackend implements JobBackend {
  private store = new Map<string, JobRecord>();
  private order: string[] = [];

  async enqueue<I>(name: string, input: I): Promise<string> {
    const jobId = makeId();
    const rec: JobRecord<I, unknown> = {
      id: jobId,
      name,
      state: "queued",
      input,
      metadata: { attempts: 0, createdAt: Date.now() },
    };
    this.store.set(jobId, rec as JobRecord);
    this.order.push(jobId);
    return jobId;
  }

  async claim(): Promise<JobRecord | null> {
    for (const jobId of this.order) {
      const rec = this.store.get(jobId);
      if (rec && rec.state === "queued") {
        rec.state = "running";
        rec.metadata.attempts += 1;
        rec.metadata.startedAt = Date.now();
        return rec;
      }
    }
    return null;
  }

  async complete<O>(jobId: string, result: O): Promise<void> {
    const rec = this.store.get(jobId);
    if (!rec) {
      throw new ZeroGError(
        "JOBS_JOB_NOT_FOUND",
        `job ${jobId} not found`,
        "verify the id returned by enqueue() and ensure the backend instance is the same one that enqueued it."
      );
    }
    rec.state = "done";
    rec.result = result;
    rec.metadata.finishedAt = Date.now();
  }

  async fail(jobId: string, error: string, retry: boolean): Promise<void> {
    const rec = this.store.get(jobId);
    if (!rec) {
      throw new ZeroGError(
        "JOBS_JOB_NOT_FOUND",
        `job ${jobId} not found`,
        "verify the id"
      );
    }
    rec.metadata.lastError = error;
    rec.metadata.finishedAt = Date.now();
    if (retry) {
      rec.state = "queued";
      rec.metadata.startedAt = undefined;
    } else {
      rec.state = "failed";
      rec.error = error;
    }
  }

  async cancel(jobId: string): Promise<void> {
    const rec = this.store.get(jobId);
    if (!rec) {
      throw new ZeroGError(
        "JOBS_JOB_NOT_FOUND",
        `job ${jobId} not found`,
        "verify the id"
      );
    }
    if (rec.state === "running" || rec.state === "queued") {
      rec.state = "cancelled";
      rec.metadata.finishedAt = Date.now();
    }
  }

  async status(jobId: string): Promise<JobRecord | null> {
    return this.store.get(jobId) ?? null;
  }

  async close(): Promise<void> {
    this.store.clear();
    this.order = [];
  }
}
