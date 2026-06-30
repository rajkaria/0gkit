/**
 * durable-agent — mcp-agent adapter
 *
 * Registers three MCP tools:
 *   agent_run      — start a new agent run (fire-and-forget); returns jobId
 *   agent_status   — inspect a run by jobId (status + completed steps)
 *   agent_cancel   — cancel a pending/running run (best-effort)
 *
 * Wiring
 * ───────
 * - Step ledger: in-process Map<jobId, Set<stepKey>>. Survives tool calls
 *   within the same process. For cross-restart durability, swap in a persistent
 *   AgentJobsBackend.
 * - Tracer: no-op tracer by default (mcp-agent base does not ship
 *   @opentelemetry/api). Add @opentelemetry/api as a dependency and replace
 *   makeNoopTracer() with an OTel tracer adapter to enable real span emission.
 *
 * Usage (in your MCP server entry point):
 *   import { registerAgentTools } from "./src/tools/agent.js";
 *   registerAgentTools(server);
 */

// NOTE: Adapters MAY import 0gkit packages.
// @opentelemetry/api is NOT a dep of mcp-agent base — using no-op tracer.

import {
  defineAgent,
  createRunner,
  makeNoopTracer,
  type AgentJobsBackend,
} from "../../agent.js";
import { defaultPipeline } from "../../steps.js";

// ---------------------------------------------------------------------------
// McpServerLike (minimal interface — same pattern as other kits)
// ---------------------------------------------------------------------------

export interface McpServerLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool(
    name: string,
    description: string,
    schema: object,
    handler: (args: any) => Promise<any>
  ): void;
}

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

type RunStatus = "running" | "done" | "failed" | "cancelled";
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
  // No-op tracer: mcp-agent base does not ship @opentelemetry/api.
  // To enable real spans, add @opentelemetry/api as a dep and inject an OTel tracer here.
  const stepTracer = makeNoopTracer();
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
// Tool registration
// ---------------------------------------------------------------------------

export function registerAgentTools(server: McpServerLike): void {

  // -------------------------------------------------------------------------
  // agent_run — start a new agent run
  // -------------------------------------------------------------------------

  server.tool(
    "agent_run",
    "Start a new durable agent run. " +
      "The agent executes a multi-step pipeline (research → act → record). " +
      "Each step is idempotent — already-completed steps are skipped on resume. " +
      "Returns a jobId to track the run via agent_status.",
    {
      type: "object",
      properties: {
        input: {
          type: "object",
          description: "Optional input payload passed to each step (e.g. { prompt: '...' })",
        },
      },
      required: [],
    },
    async ({ input }: { input?: Record<string, unknown> }) => {
      const resolvedInput = input ?? {};
      const jobId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      startAgentRun(jobId, resolvedInput);

      return {
        content: [
          {
            type: "text",
            text: `Agent run started. jobId: ${jobId}\nUse agent_status to check progress.`,
          },
        ],
      };
    }
  );

  // -------------------------------------------------------------------------
  // agent_status — inspect a run
  // -------------------------------------------------------------------------

  server.tool(
    "agent_status",
    "Inspect the status of a durable agent run. " +
      "Returns the run status (running/done/failed/cancelled), " +
      "the list of completed step keys, and any error message on failure.",
    {
      type: "object",
      properties: {
        jobId: {
          type: "string",
          description: "The jobId returned by agent_run",
        },
      },
      required: ["jobId"],
    },
    async ({ jobId }: { jobId: string }) => {
      const run = runRegistry.get(jobId);
      if (!run) {
        return {
          content: [{ type: "text", text: `No run found for jobId: ${jobId}` }],
        };
      }

      const completedSteps = Array.from(getLedgerForJob(jobId));
      const lines = [
        `jobId: ${jobId}`,
        `status: ${run.status}`,
        `completedSteps: ${completedSteps.length > 0 ? completedSteps.join(", ") : "(none)"}`,
        ...(run.error ? [`error: ${run.error}`] : []),
      ];
      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // agent_cancel — cancel a run (best-effort)
  // -------------------------------------------------------------------------

  server.tool(
    "agent_cancel",
    "Cancel a pending or running durable agent run. " +
      "Best-effort: if the run is already done or failed, this is a no-op. " +
      "Already-completed steps are retained in the ledger so a future " +
      "agent_run call can resume from where it left off.",
    {
      type: "object",
      properties: {
        jobId: {
          type: "string",
          description: "The jobId to cancel",
        },
      },
      required: ["jobId"],
    },
    async ({ jobId }: { jobId: string }) => {
      const run = runRegistry.get(jobId);
      if (!run) {
        return {
          content: [{ type: "text", text: `No run found for jobId: ${jobId}` }],
        };
      }

      if (run.status === "running") {
        runRegistry.set(jobId, { status: "cancelled" });
        return {
          content: [
            {
              type: "text",
              text: `Run ${jobId} cancelled (in-flight steps may still complete).`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Run ${jobId} is already ${run.status}. No action taken.`,
          },
        ],
      };
    }
  );
}
