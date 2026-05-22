# `@foundryprotocol/0gkit-jobs`

Durable async job runner for long-running 0G operations (inference, multi-step
agents, batched uploads, DA publishes). Three swappable backends behind one
interface; zod-typed `jobs.define()`; HMAC-signed webhook delivery on state
transitions; graceful shutdown via `AbortSignal` (designed for Vercel Fluid
Compute and similar serverless runtimes).

## Install

```bash
pnpm add @foundryprotocol/0gkit-jobs @foundryprotocol/0gkit-core zod

# redis backend only
pnpm add ioredis
```

## Quickstart

```ts
import { JobRunner, jobs } from "@foundryprotocol/0gkit-jobs";
import { MemoryBackend } from "@foundryprotocol/0gkit-jobs/backends/memory";
import { z } from "zod";

const InferenceJob = jobs.define({
  name: "inference",
  input: z.object({ prompt: z.string(), model: z.string() }),
  output: z.object({ text: z.string() }),
  handler: async ({ input, signal }) => {
    // Use `signal` for graceful shutdown; fail-fast in long handlers.
    if (signal.aborted) throw new Error("shutting down");
    return { text: "..." };
  },
});

const runner = new JobRunner({
  backend: new MemoryBackend(),
  signer,
  webhook: { url: process.env.WEBHOOK_URL!, secret: process.env.WEBHOOK_SECRET! },
});
runner.register(InferenceJob);
await runner.start({ concurrency: 4 });

const id = await runner.enqueue(InferenceJob, { prompt: "hi", model: "..." });
const final = await runner.waitFor(id);
```

## Backends

| Backend | Install                         | When to use                      |
| ------- | ------------------------------- | -------------------------------- |
| memory  | (built-in)                      | dev, tests, ephemeral workflows  |
| sqlite  | (built-in via `better-sqlite3`) | single-node prod, no extra infra |
| redis   | optional peer `ioredis`         | multi-node prod, fan-out         |

## Webhook verification (server side)

```ts
import { jobs } from "@foundryprotocol/0gkit-jobs";

app.post("/api/jobs/webhook", express.text({ type: "*/*" }), (req, res) => {
  const ok = jobs.verifyWebhook({
    body: req.body,
    signature: req.header("x-0gkit-signature") ?? "",
    secret: process.env.JOBS_SECRET!,
  });
  if (!ok) return res.status(401).send("bad signature");
  // ... dedupe on (jobId + newState)
});
```

## Vercel Fluid Compute

Functions get a grace period on shutdown. Register a `beforeExit` hook that
calls `runner.stop({ drain: true, timeoutMs: 25_000 })` so in-flight jobs land
cleanly before the instance is reaped.

## Error codes

- [`JOBS_BACKEND_UNREACHABLE`](https://0gkit.dev/errors/JOBS_BACKEND_UNREACHABLE)
- [`JOBS_JOB_NOT_FOUND`](https://0gkit.dev/errors/JOBS_JOB_NOT_FOUND)
- [`JOBS_HANDLER_THREW`](https://0gkit.dev/errors/JOBS_HANDLER_THREW)
- [`JOBS_WEBHOOK_BAD_SIGNATURE`](https://0gkit.dev/errors/JOBS_WEBHOOK_BAD_SIGNATURE)

## At-least-once delivery

A worker that crashes between handler completion and `backend.complete()`
returning will retry on next claim. **Handlers must be idempotent on their
inputs** — use `jobId` as the idempotency key for any external side effect.
Webhook receivers should dedupe on `(jobId, newState)`.

## License

MIT
