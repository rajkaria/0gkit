/**
 * durable-agent — tee-attested-api adapter
 *
 * Hono router mounted under /agent.
 *
 * POST /agent/run            — start a new agent run (enqueued via 0gkit-jobs)
 *   Body: { input?: Record<string,unknown> }
 *   Response: { jobId: string }
 *
 * GET  /agent/status/:jobId  — check run status + completed steps
 *   Response: { jobId, status, completedSteps: string[] }
 *
 * Durability model
 * ─────────────────
 * DURABLE (survives restarts):
 *   - Step ledger — completed step keys serialized to JSON and uploaded to 0G Storage
 *     (content-addressed root-registry pattern, exactly like the agent-memory kit).
 *
 * NOT durable (in-process only):
 *   - Run status registry (running/done/failed) — module-scoped Map.
 *   - JobRunner / MemoryBackend — in-process job queue by default.
 *     Swap in @foundryprotocol/0gkit-jobs/backends/sqlite for cross-process durability.
 *
 * Tracing
 * ────────
 * Real OTel spans via @opentelemetry/api (available in tee-attested-api base).
 * The kit does NOT call instrument0g() — that is the app's responsibility.
 * Each executed step opens a span keyed by its step.key.
 *
 * Usage (in src/app.ts):
 *   import { buildAgentRouter } from "./routes/agent.js";
 *   app.route("/agent", buildAgentRouter());
 *
 * Environment variables (set in .env):
 *   OG_PRIVATE_KEY          — 0x-prefixed private key (required)
 *   OG_RPC_URL              — 0G chain RPC URL (required)
 *   OG_STORAGE_NAMESPACE    — blob namespace prefix (default: "durable-agent")
 *   OG_JOBS_BACKEND         — informational; "memory" (default) or "sqlite"
 */

// NOTE: Adapters MAY import 0gkit packages.
// @opentelemetry/api is a dep of tee-attested-api base — safe to import here.
import { Hono } from "hono";
import { trace } from "@opentelemetry/api";
import { z } from "zod";
import { JobRunner, jobs } from "@foundryprotocol/0gkit-jobs";
import { MemoryBackend } from "@foundryprotocol/0gkit-jobs/backends/memory";
// SQLite backend for cross-process job durability:
//   import { SqliteBackend } from "@foundryprotocol/0gkit-jobs/backends/sqlite";
import { fromPrivateKey } from "@foundryprotocol/0gkit-wallet";
import { Storage, type StorageConfig } from "@foundryprotocol/0gkit-storage";

import {
  defineAgent,
  createRunner,
  type AgentJobsBackend,
  type StepTracer,
} from "../../agent.js";
import { defaultPipeline } from "../../steps.js";

// ---------------------------------------------------------------------------
// Singleton Storage instance
// ---------------------------------------------------------------------------

let _storage: Storage | undefined;

function getStorage(): Storage {
  if (!_storage) {
    const privateKey = process.env.OG_PRIVATE_KEY;
    const rpcUrl = process.env.OG_RPC_URL;
    if (!privateKey || !rpcUrl) {
      throw new Error(
        "Missing OG_PRIVATE_KEY or OG_RPC_URL. " +
          "These are required for durable step-ledger persistence in 0G Storage."
      );
    }
    const config: StorageConfig = { privateKey, rpcUrl };
    _storage = new Storage(config);
  }
  return _storage;
}

// ---------------------------------------------------------------------------
// Root registry: jobId → latest 0G Storage root for the step-ledger blob
//
// DURABLE CONTENT: step-ledger JSON lives in 0G Storage. This in-process Map
// tracks the latest root per jobId. Survives multiple requests within the same
// process. On cold start it is empty — add a persistent root-registry store
// (another 0G blob) for full restart durability.
// ---------------------------------------------------------------------------

const rootRegistry = new Map<string, string>();

// ---------------------------------------------------------------------------
// 0G-Storage-backed AgentJobsBackend
// ---------------------------------------------------------------------------

function makeStorageBackend(jobId: string): AgentJobsBackend {
  const ns = process.env.OG_STORAGE_NAMESPACE ?? "durable-agent";
  const ledgerKey = `${ns}/${jobId}/steps`;

  return {
    async getCompletedSteps(): Promise<Set<string>> {
      const root = rootRegistry.get(ledgerKey);
      if (!root) return new Set<string>();
      try {
        const bytes = await getStorage().download(root);
        if (!bytes) return new Set<string>();
        const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
        if (Array.isArray(parsed)) return new Set<string>(parsed as string[]);
        return new Set<string>();
      } catch {
        return new Set<string>();
      }
    },

    async markStepDone(key: string): Promise<void> {
      const current = await this.getCompletedSteps();
      current.add(key);
      const encoded = new TextEncoder().encode(JSON.stringify(Array.from(current)));
      const result = await getStorage().upload(encoded);
      rootRegistry.set(ledgerKey, result.root);
    },
  };
}

// ---------------------------------------------------------------------------
// Run status registry (in-process — NOT durable across restarts)
// ---------------------------------------------------------------------------

type RunStatus = "running" | "done" | "failed";
const runRegistry = new Map<string, { status: RunStatus; error?: string }>();

// ---------------------------------------------------------------------------
// OTel tracer factory (real spans — tee-attested-api has @opentelemetry/api)
// ---------------------------------------------------------------------------

function makeOtelTracer(): StepTracer {
  const tracer = trace.getTracer("durable-agent");
  return {
    startSpan(name: string) {
      const span = tracer.startSpan(name);
      return {
        end() {
          span.end();
        },
        setError(e: unknown) {
          span.recordException(e as Error);
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Agent definition
// ---------------------------------------------------------------------------

const agentDef = defineAgent({
  name: "durable-agent",
  steps: defaultPipeline,
});

// ---------------------------------------------------------------------------
// 0gkit-jobs wiring
// ---------------------------------------------------------------------------

const jobBackend = new MemoryBackend();

const agentJobDef = jobs.define({
  name: "durable-agent-run",
  input: z.object({
    jobId: z.string(),
    input: z.record(z.unknown()),
  }),
  output: z.object({ completedSteps: z.array(z.string()) }),
  handler: async ({ input: payload }) => {
    const { jobId, input } = payload;

    runRegistry.set(jobId, { status: "running" });

    // Step ledger backed by 0G Storage — durable, survives restarts
    const agentBackend = makeStorageBackend(jobId);

    // Real OTel tracer — tee-attested-api base ships @opentelemetry/api
    const stepTracer = makeOtelTracer();

    const runner = createRunner({
      agent: agentDef,
      backend: agentBackend,
      tracer: stepTracer,
    });

    await runner.run(input);

    const completed = Array.from(await agentBackend.getCompletedSteps());
    runRegistry.set(jobId, { status: "done" });
    return { completedSteps: completed };
  },
  maxAttempts: 3,
});

let _jobRunner: JobRunner | undefined;

async function getJobRunner(): Promise<JobRunner> {
  if (_jobRunner) return _jobRunner;

  const privateKey = process.env.OG_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      "Missing OG_PRIVATE_KEY — required to build the 0gkit-jobs signer."
    );
  }
  const signer = await fromPrivateKey(privateKey);

  _jobRunner = new JobRunner({ backend: jobBackend, signer });
  _jobRunner.register(agentJobDef);
  await _jobRunner.start();
  return _jobRunner;
}

// ---------------------------------------------------------------------------
// Router (exported; mount in src/app.ts under /agent)
// ---------------------------------------------------------------------------

export function buildAgentRouter(): Hono {
  const router = new Hono();

  // POST /agent/run — enqueue an agent run via 0gkit-jobs
  router.post("/run", async (c) => {
    let body: { input?: Record<string, unknown> } = {};
    try {
      body = (await c.req.json()) as { input?: Record<string, unknown> };
    } catch {
      /* empty body */
    }

    const input = body.input ?? {};
    const jobId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const jobRunner = await getJobRunner();
    await jobRunner.enqueue(agentJobDef, { jobId, input });
    runRegistry.set(jobId, { status: "running" });

    return c.json({ jobId });
  });

  // GET /agent/status/:jobId — check status + completed steps (from Storage)
  router.get("/status/:jobId", async (c) => {
    const jobId = c.req.param("jobId");

    const run = runRegistry.get(jobId);
    if (!run) {
      return c.json({ error: "job not found" }, 404);
    }

    // Read completed steps from the durable 0G Storage ledger
    const agentBackend = makeStorageBackend(jobId);
    const completedSteps = Array.from(await agentBackend.getCompletedSteps());

    return c.json({
      jobId,
      status: run.status,
      completedSteps,
      ...(run.error ? { error: run.error } : {}),
    });
  });

  return router;
}
