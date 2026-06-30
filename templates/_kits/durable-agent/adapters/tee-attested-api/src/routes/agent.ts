/**
 * durable-agent — tee-attested-api adapter
 *
 * Hono router mounted under /agent.
 *
 * POST /agent/run        — start a new agent run (fire-and-forget)
 *   Body: { input?: Record<string,unknown> }
 *   Response: { jobId: string }
 *
 * GET  /agent/status/:jobId — check run status + completed steps
 *   Response: { jobId, status, completedSteps: string[] }
 *
 * Wiring
 * ───────
 * - Step ledger: in-process Map<jobId, Set<stepKey>>. Survives requests within
 *   the same process. For cross-restart durability, swap in a persistent backend.
 * - Tracer: @opentelemetry/api trace.getTracer("durable-agent"). The
 *   tee-attested-api base ships @opentelemetry/api so spans are emitted to
 *   whatever exporter the app's instrument0g configures. The kit does NOT call
 *   instrument0g — that is the app's responsibility.
 *
 * Usage (in src/app.ts):
 *   import { buildAgentRouter } from "./routes/agent.js";
 *   app.route("/agent", buildAgentRouter());
 */

// NOTE: Adapters MAY import 0gkit packages.
// @opentelemetry/api is a dep of tee-attested-api base — safe to import here.
import { Hono } from "hono";
import { trace } from "@opentelemetry/api";

import {
  defineAgent,
  createRunner,
  type AgentJobsBackend,
  type StepTracer,
} from "../../agent.js";
import { defaultPipeline } from "../../steps.js";

// ---------------------------------------------------------------------------
// Step ledger: in-process Map<jobId, Set<stepKey>>
// ---------------------------------------------------------------------------

const stepLedger = new Map<string, Set<string>>();

function getLedgerForJob(jobId: string): Set<string> {
  if (!stepLedger.has(jobId)) stepLedger.set(jobId, new Set());
  return stepLedger.get(jobId)!;
}

function makeAgentBackend(jobId: string): AgentJobsBackend {
  return {
    async getCompletedSteps(): Promise<Set<string>> {
      return new Set(getLedgerForJob(jobId));
    },
    async markStepDone(key: string): Promise<void> {
      getLedgerForJob(jobId).add(key);
    },
  };
}

// ---------------------------------------------------------------------------
// Run registry
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
        end() { span.end(); },
        setError(e: unknown) { span.recordException(e as Error); },
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
// In-process runner
// ---------------------------------------------------------------------------

function startAgentRun(jobId: string, input: Record<string, unknown>): void {
  runRegistry.set(jobId, { status: "running" });

  const agentBackend = makeAgentBackend(jobId);
  const stepTracer = makeOtelTracer();
  const runner = createRunner({ agent: agentDef, backend: agentBackend, tracer: stepTracer });

  runner.run(input).then(
    () => { runRegistry.set(jobId, { status: "done" }); },
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      runRegistry.set(jobId, { status: "failed", error: message });
    }
  );
}

// ---------------------------------------------------------------------------
// Router (exported; mount in src/app.ts under /agent)
// ---------------------------------------------------------------------------

export function buildAgentRouter(): Hono {
  const router = new Hono();

  // POST /agent/run — start an agent run
  router.post("/run", async (c) => {
    let body: { input?: Record<string, unknown> } = {};
    try {
      body = (await c.req.json()) as { input?: Record<string, unknown> };
    } catch { /* empty body */ }

    const input = body.input ?? {};
    const jobId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    startAgentRun(jobId, input);
    return c.json({ jobId });
  });

  // GET /agent/status/:jobId — check status + completed steps
  router.get("/status/:jobId", (c) => {
    const jobId = c.req.param("jobId");

    const run = runRegistry.get(jobId);
    if (!run) {
      return c.json({ error: "job not found" }, 404);
    }

    const completedSteps = Array.from(getLedgerForJob(jobId));
    return c.json({
      jobId,
      status: run.status,
      completedSteps,
      ...(run.error ? { error: run.error } : {}),
    });
  });

  return router;
}
