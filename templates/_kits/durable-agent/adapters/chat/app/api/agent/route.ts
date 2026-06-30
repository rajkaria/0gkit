/**
 * durable-agent — chat adapter
 *
 * Next.js App Router route handler (mirrors react-app adapter).
 * The chat base is also a Next.js App Router project — same adapter shape.
 *
 * POST /api/agent        — start a new agent run
 *   Body: { input?: Record<string,unknown> }
 *   Response: { jobId: string }
 *
 * GET  /api/agent?jobId=<id>  — check run status
 *   Response: { jobId, status, completedSteps: string[] }
 *
 * Wiring identical to react-app adapter — see adapters/react-app for notes.
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
// Step ledger
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
// In-process runner
// ---------------------------------------------------------------------------

function startAgentRun(jobId: string, input: Record<string, unknown>): void {
  runRegistry.set(jobId, { status: "running" });

  const agentBackend = makeAgentBackend(jobId);
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
// POST /api/agent
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    let body: { input?: Record<string, unknown> } = {};
    try {
      body = (await request.json()) as { input?: Record<string, unknown> };
    } catch {
      /* empty body */
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
// GET /api/agent?jobId=<id>
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
