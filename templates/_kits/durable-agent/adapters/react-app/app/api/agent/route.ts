/**
 * durable-agent — react-app adapter
 *
 * Next.js App Router route handler for durable agent operations.
 *
 * POST /api/agent        — start a new agent run (fire-and-forget)
 *   Body: { input?: Record<string,unknown> }
 *   Response: { jobId: string }
 *
 * GET  /api/agent?jobId=<id>  — check run status
 *   Response: { jobId, status, completedSteps: string[] }
 *
 * Wiring
 * ───────
 * - Step ledger: in-process Map<jobId, Set<stepKey>>. Survives requests within
 *   the same server process. For cross-restart durability, back this with a
 *   persistent store (0G Storage blob, Redis, or 0gkit-jobs backend metadata).
 * - Tracer: uses a no-op tracer by default (react-app base does not ship
 *   @opentelemetry/api). To enable real tracing, call instrument0g() from
 *   @foundryprotocol/0gkit-observability in your app layout, then replace
 *   makeNoopTracer() with an OTel tracer adapter.
 *
 * Environment variables:
 *   (none required by the durable-agent kit itself)
 */

// NOTE: Adapters MAY import 0gkit packages.
import { NextRequest, NextResponse } from "next/server";

import {
  defineAgent,
  createRunner,
  makeNoopTracer,
  type AgentJobsBackend,
} from "../../../agent.js";
import { defaultPipeline } from "../../../steps.js";

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
// Agent definition
// ---------------------------------------------------------------------------

const agentDef = defineAgent({
  name: "durable-agent",
  steps: defaultPipeline,
});

// ---------------------------------------------------------------------------
// In-process runner (fire-and-forget)
// ---------------------------------------------------------------------------

function startAgentRun(jobId: string, input: Record<string, unknown>): void {
  runRegistry.set(jobId, { status: "running" });

  const agentBackend = makeAgentBackend(jobId);
  // No-op tracer: react-app base does not ship @opentelemetry/api.
  // Replace with an OTel tracer adapter if you configure instrument0g().
  const stepTracer = makeNoopTracer();
  const runner = createRunner({
    agent: agentDef,
    backend: agentBackend,
    tracer: stepTracer,
  });

  runner.run(input).then(
    () => {
      runRegistry.set(jobId, { status: "done" });
    },
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      runRegistry.set(jobId, { status: "failed", error: message });
    }
  );
}

// ---------------------------------------------------------------------------
// POST /api/agent — start a new agent run
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

    startAgentRun(jobId, input);
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

  const completedSteps = Array.from(getLedgerForJob(jobId));
  return NextResponse.json({
    jobId,
    status: run.status,
    completedSteps,
    ...(run.error ? { error: run.error } : {}),
  });
}
