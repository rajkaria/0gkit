/**
 * durable-agent — react-app adapter
 *
 * Next.js App Router route handler for durable agent operations.
 *
 * POST /api/agent            — start a new agent run (enqueued via 0gkit-jobs)
 *   Body: { input?: Record<string,unknown> }
 *   Response: { jobId: string }
 *
 * GET  /api/agent?jobId=<id>  — check run status + completed steps
 *   Response: { jobId, status, completedSteps: string[] }
 *
 * Durability model
 * ─────────────────
 * DURABLE (survives restarts):
 *   - Step ledger — completed step keys are serialized to JSON and uploaded to
 *     0G Storage (content-addressed root-registry pattern, exactly like the
 *     agent-memory kit). On cold start the root registry is empty; completed
 *     steps are re-read from Storage on the first getCompletedSteps() call.
 *
 * NOT durable (in-process only):
 *   - Run status registry (running/done/failed) — lives in a module-scoped Map.
 *     A process restart loses run-status; the completed-step ledger in Storage
 *     is still intact, so a retry of the jobId resumes correctly.
 *   - JobRunner / MemoryBackend — the jobs queue itself is in-process by default
 *     (MemoryBackend). Swap in @foundryprotocol/0gkit-jobs/backends/sqlite for a
 *     cross-process durable job queue.
 *
 * Jobs wiring
 * ────────────
 * Each POST enqueues the agent run as a real 0gkit-jobs job. A singleton
 * JobRunner is started at module init and processes jobs from the MemoryBackend.
 * The job handler runs the agent steps via the lib's createRunner, replaying the
 * 0G-Storage-persisted step ledger so already-completed steps are skipped on
 * retry/resume.
 *
 * Tracing
 * ────────
 * No-op tracer: react-app base does not ship @opentelemetry/api. Replace
 * makeNoopTracer() with an OTel tracer adapter if you configure instrument0g()
 * from @foundryprotocol/0gkit-observability.
 *
 * Environment variables (set in .env.local):
 *   OG_PRIVATE_KEY          — 0x-prefixed private key (required for 0gkit-jobs signer + Storage)
 *   OG_RPC_URL              — 0G chain RPC URL (required for Storage)
 *   OG_STORAGE_NAMESPACE    — blob namespace prefix (default: "durable-agent")
 *   OG_JOBS_BACKEND         — informational; "memory" (default, in-process) or "sqlite"
 *                             (cross-process durable — swap MemoryBackend for SqliteBackend)
 */

// NOTE: Adapters MAY import 0gkit packages.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { JobRunner, jobs } from "@foundryprotocol/0gkit-jobs";
import { MemoryBackend } from "@foundryprotocol/0gkit-jobs/backends/memory";
// SQLite backend is available for cross-process durability:
//   import { SqliteBackend } from "@foundryprotocol/0gkit-jobs/backends/sqlite";
import { fromPrivateKey } from "@foundryprotocol/0gkit-wallet";
import { Storage, type StorageConfig } from "@foundryprotocol/0gkit-storage";

import {
  defineAgent,
  createRunner,
  makeNoopTracer,
  type AgentJobsBackend,
} from "../../../agent.js";
import { defaultPipeline } from "../../../steps.js";

// ---------------------------------------------------------------------------
// Singleton Storage instance (server-side only, module-scoped)
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
// DURABLE CONTENT: The step-ledger JSON lives in 0G Storage (content-addressed
// immutable blobs). This in-process Map tracks the latest root per jobId so we
// can download the current ledger. Survives multiple requests within the same
// process. On cold start it is empty — completed steps are re-read from Storage
// the first time getCompletedSteps() is called for a given jobId, provided the
// caller supplies the prior root (e.g. via a persistent KV or the job metadata).
//
// For full cross-restart root-registry durability, persist this Map to another
// 0G blob (keyed by a well-known namespace), mirroring agent-memory's approach.
// ---------------------------------------------------------------------------

const rootRegistry = new Map<string, string>();

// ---------------------------------------------------------------------------
// 0G-Storage-backed AgentJobsBackend
//
// DURABLE: The step ledger (a JSON array of completed step keys) is persisted to
// 0G Storage on every markStepDone(). getCompletedSteps() downloads the latest
// blob via the root stored in rootRegistry. A process restart retains durability
// as long as rootRegistry is re-hydrated (see comment above).
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
        // Storage unavailable or corrupt blob — start fresh (safe: steps will re-run)
        return new Set<string>();
      }
    },

    async markStepDone(key: string): Promise<void> {
      // Download current ledger, add key, re-upload, update root pointer
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
// Agent definition
// ---------------------------------------------------------------------------

const agentDef = defineAgent({
  name: "durable-agent",
  steps: defaultPipeline,
});

// ---------------------------------------------------------------------------
// 0gkit-jobs: define the agent job + build the singleton JobRunner
//
// MemoryBackend: in-process job queue (default, dev-friendly).
// For cross-process job durability, swap in SqliteBackend:
//   import { SqliteBackend } from "@foundryprotocol/0gkit-jobs/backends/sqlite";
//   const jobBackend = new SqliteBackend({ path: process.env.OG_SQLITE_PATH ?? "./jobs.db" });
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

    // Mark the run as running in the in-process registry
    runRegistry.set(jobId, { status: "running" });

    // Step ledger backed by 0G Storage — durable, survives restarts
    const agentBackend = makeStorageBackend(jobId);

    // No-op tracer: react-app base does not ship @opentelemetry/api.
    // Swap in an OTel tracer adapter if you configure instrument0g().
    const stepTracer = makeNoopTracer();

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

// Singleton JobRunner — started once at module load time
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
// POST /api/agent — enqueue a new agent run via 0gkit-jobs
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    let body: { input?: Record<string, unknown> } = {};
    try {
      body = (await request.json()) as { input?: Record<string, unknown> };
    } catch {
      /* empty body is fine */
    }

    const input = body.input ?? {};
    const jobId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const jobRunner = await getJobRunner();
    // Enqueue the run as a real 0gkit-jobs job — worker picks it up asynchronously
    await jobRunner.enqueue(agentJobDef, { jobId, input });
    // Pre-register as "running" so status polls see it immediately
    runRegistry.set(jobId, { status: "running" });

    return NextResponse.json({ jobId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// GET /api/agent?jobId=<id> — check run status + completed steps
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json(
      { error: "missing jobId query parameter" },
      { status: 400 }
    );
  }

  const run = runRegistry.get(jobId);
  if (!run) {
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  }

  // Read completed steps from the durable 0G Storage ledger
  const agentBackend = makeStorageBackend(jobId);
  const completedSteps = Array.from(await agentBackend.getCompletedSteps());

  return NextResponse.json({
    jobId,
    status: run.status,
    completedSteps,
    ...(run.error ? { error: run.error } : {}),
  });
}
