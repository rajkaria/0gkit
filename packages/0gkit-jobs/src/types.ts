import type { z } from "zod";
import type { Signer } from "@foundryprotocol/0gkit-core";

export type JobState = "queued" | "running" | "done" | "failed" | "cancelled";

export interface JobMetadata {
  attempts: number;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  lastError?: string;
}

export interface JobRecord<I = unknown, O = unknown> {
  id: string;
  name: string;
  state: JobState;
  input: I;
  result?: O;
  error?: string;
  metadata: JobMetadata;
}

export interface JobHandlerContext<I> {
  input: I;
  jobId: string;
  signer: Signer;
  signal: AbortSignal;
  attempt: number;
  metadata: JobMetadata;
}

export interface JobDefinition<I, O> {
  readonly name: string;
  readonly inputSchema: z.ZodType<I>;
  readonly outputSchema: z.ZodType<O>;
  readonly handler: (ctx: JobHandlerContext<I>) => Promise<O>;
  readonly maxAttempts: number;
  readonly backoffMs: (attempt: number) => number;
}

export interface ClaimOpts {
  workerId: string;
}

export interface JobBackend {
  enqueue<I>(name: string, input: I): Promise<string>;
  claim(opts: ClaimOpts): Promise<JobRecord | null>;
  complete<O>(id: string, result: O): Promise<void>;
  fail(id: string, error: string, retry: boolean): Promise<void>;
  cancel(id: string): Promise<void>;
  status(id: string): Promise<JobRecord | null>;
  close(): Promise<void>;
}

export interface WebhookConfig {
  url: string;
  secret: string;
  retries?: number;
}

export interface RunnerConfig {
  backend: JobBackend;
  signer: Signer;
  webhook?: WebhookConfig;
  pollIntervalMs?: number;
}
