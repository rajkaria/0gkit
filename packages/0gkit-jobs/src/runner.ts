import { ZeroGError } from "@foundryprotocol/0gkit-core";
import type { JobBackend, JobDefinition, JobRecord, RunnerConfig } from "./types.js";
import { signWebhookBody } from "./webhook.js";

interface StartOpts {
  concurrency?: number;
}

interface StopOpts {
  drain?: boolean;
  timeoutMs?: number;
}

interface WaitOpts {
  timeoutMs?: number;
  pollMs?: number;
}

export class JobRunner {
  private definitions = new Map<string, JobDefinition<unknown, unknown>>();
  private abortController = new AbortController();
  private workers: Promise<void>[] = [];
  private running = false;

  constructor(private config: RunnerConfig) {}

  register<I, O>(def: JobDefinition<I, O>): this {
    this.definitions.set(def.name, def as unknown as JobDefinition<unknown, unknown>);
    return this;
  }

  async enqueue<I, O>(def: JobDefinition<I, O>, input: I): Promise<string> {
    def.inputSchema.parse(input);
    return this.config.backend.enqueue(def.name, input);
  }

  async start(opts: StartOpts = {}): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.abortController = new AbortController();
    const concurrency = Math.max(1, opts.concurrency ?? 1);
    for (let i = 0; i < concurrency; i++) {
      this.workers.push(this.workerLoop(`w${i}`));
    }
  }

  async stop(opts: StopOpts = {}): Promise<void> {
    if (!this.running) return;
    this.running = false;
    const drain = opts.drain ?? true;
    if (!drain) {
      this.abortController.abort();
    }
    const timeoutMs = opts.timeoutMs ?? 5000;
    await Promise.race([
      Promise.all(this.workers),
      new Promise<void>((res) => setTimeout(res, timeoutMs)),
    ]);
    this.workers = [];
  }

  async waitFor(id: string, opts: WaitOpts = {}): Promise<JobRecord> {
    const deadline = Date.now() + (opts.timeoutMs ?? 30_000);
    const poll = opts.pollMs ?? 25;
    while (Date.now() < deadline) {
      const rec = await this.config.backend.status(id);
      if (
        rec &&
        (rec.state === "done" || rec.state === "failed" || rec.state === "cancelled")
      ) {
        return rec;
      }
      await new Promise((r) => setTimeout(r, poll));
    }
    throw new ZeroGError(
      "JOBS_BACKEND_UNREACHABLE",
      `waitFor timed out for job ${id}`,
      "increase timeoutMs or check the backend is reachable and a worker is running."
    );
  }

  private async claimSafe(workerId: string): Promise<JobRecord | null> {
    try {
      return await this.config.backend.claim({ workerId });
    } catch (err) {
      if (err instanceof ZeroGError) return null;
      throw err;
    }
  }

  private async workerLoop(workerId: string): Promise<void> {
    const pollMs = this.config.pollIntervalMs ?? 50;
    while (this.running) {
      if (this.abortController.signal.aborted) return;
      const rec = await this.claimSafe(workerId);
      if (!rec) {
        await this.sleep(pollMs);
        continue;
      }
      await this.runOne(rec);
    }
  }

  private async runOne(rec: JobRecord): Promise<void> {
    const def = this.definitions.get(rec.name);
    if (!def) {
      await this.config.backend.fail(
        rec.id,
        `no definition registered for "${rec.name}"`,
        false
      );
      await this.fireWebhook(
        rec.id,
        rec.name,
        "running",
        "failed",
        undefined,
        "no def"
      );
      return;
    }
    try {
      const result = await def.handler({
        input: rec.input,
        jobId: rec.id,
        signer: this.config.signer,
        signal: this.abortController.signal,
        attempt: rec.metadata.attempts,
        metadata: rec.metadata,
      });
      def.outputSchema.parse(result);
      await this.config.backend.complete(rec.id, result);
      await this.fireWebhook(rec.id, rec.name, "running", "done", result, undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const aborted = this.abortController.signal.aborted;
      const willRetry = rec.metadata.attempts < def.maxAttempts && !aborted;
      if (willRetry) {
        await this.sleep(def.backoffMs(rec.metadata.attempts));
        if (this.abortController.signal.aborted) {
          await this.config.backend.fail(rec.id, msg, false);
          await this.fireWebhook(rec.id, rec.name, "running", "failed", undefined, msg);
          return;
        }
      }
      await this.config.backend.fail(rec.id, msg, willRetry);
      await this.fireWebhook(
        rec.id,
        rec.name,
        "running",
        willRetry ? "queued" : "failed",
        undefined,
        msg
      );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((res) => setTimeout(res, ms));
  }

  private async fireWebhook(
    jobId: string,
    jobName: string,
    previousState: JobRecord["state"],
    newState: JobRecord["state"],
    result: unknown,
    error: string | undefined
  ): Promise<void> {
    if (!this.config.webhook) return;
    const body = JSON.stringify({
      jobId,
      jobName,
      previousState,
      newState,
      result,
      error,
      ts: Date.now(),
    });
    const signature = signWebhookBody(body, this.config.webhook.secret);
    const retries = this.config.webhook.retries ?? 2;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(this.config.webhook.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-0gkit-signature": `sha256=${signature}`,
            "x-0gkit-job-id": jobId,
            "x-0gkit-event": "state-change",
          },
          body,
        });
        if (res.ok) return;
      } catch {
        // swallow & retry
      }
      if (attempt < retries) {
        await this.sleep(250 * (attempt + 1));
      }
    }
  }

  /** Look up a registered definition by name (test/inspection helper). */
  hasDefinition(name: string): boolean {
    return this.definitions.has(name);
  }
}

export type { JobBackend, JobDefinition };
