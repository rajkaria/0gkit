/**
 * durable-agent — storage-app adapter
 *
 * Node.js module that runs the durable agent loop in the storage-app context.
 * The storage-app base is a Node.js script (not Next.js / Hono), so this
 * adapter exports a runDurableAgent() function that can be called from
 * the base's src/index.ts or triggered as a standalone CLI step.
 *
 * Wiring
 * ───────
 * - Step ledger: in-process Map<stepKey, true>. For cross-restart durability,
 *   swap in a persistent AgentJobsBackend backed by 0G Storage (upload the
 *   completed-keys set as a blob; download it on init to resume).
 * - Tracer: no-op tracer by default (storage-app base does not ship
 *   @opentelemetry/api). Add @opentelemetry/api as a dep and replace
 *   makeNoopTracer() with an OTel tracer adapter to enable real span emission.
 *
 * Usage (in src/index.ts):
 *   import { runDurableAgent } from "./agent-runner.js";
 *   await runDurableAgent({ input: { prompt: "Hello 0G!" } });
 */

// NOTE: Adapters MAY import 0gkit packages.
// @opentelemetry/api is NOT a dep of storage-app base — using no-op tracer.

import {
  defineAgent,
  createRunner,
  makeNoopTracer,
  type AgentJobsBackend,
} from "../agent.js";
import { defaultPipeline } from "../steps.js";

// ---------------------------------------------------------------------------
// Public options
// ---------------------------------------------------------------------------

export interface RunDurableAgentOptions {
  /**
   * Optional input payload passed to each step.
   * Example: { prompt: "Summarize the 0G network." }
   */
  input?: Record<string, unknown>;
  /**
   * Optional job ID for ledger keying (used to resume a prior run).
   * If omitted, a new unique ID is generated and returned.
   */
  jobId?: string;
  /**
   * Optional pre-populated step ledger (for resuming a previous run).
   * Pass the completedSteps from a prior run's result to skip those steps.
   */
  completedSteps?: string[];
}

export interface RunDurableAgentResult {
  jobId: string;
  completedSteps: string[];
}

// ---------------------------------------------------------------------------
// Agent definition
// ---------------------------------------------------------------------------

const agentDef = defineAgent({
  name: "durable-agent",
  steps: defaultPipeline,
});

// ---------------------------------------------------------------------------
// runDurableAgent
// ---------------------------------------------------------------------------

/**
 * Run the durable agent pipeline synchronously (awaitable).
 *
 * Resumable: pass `completedSteps` from a prior run's result to skip steps
 * that were already completed. On success, `completedSteps` in the returned
 * result contains all step keys (including any skipped on this run).
 */
export async function runDurableAgent(
  options: RunDurableAgentOptions = {}
): Promise<RunDurableAgentResult> {
  const { input = {}, completedSteps: priorCompleted = [] } = options;
  const jobId =
    options.jobId ?? `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Build in-memory backend seeded with any prior completed steps
  const ledger = new Set<string>(priorCompleted);
  const agentBackend: AgentJobsBackend = {
    async getCompletedSteps(): Promise<Set<string>> {
      return new Set(ledger);
    },
    async markStepDone(key: string): Promise<void> {
      ledger.add(key);
    },
  };

  // No-op tracer: storage-app base does not ship @opentelemetry/api.
  // To enable real spans, add @opentelemetry/api as a dep and inject an OTel tracer.
  const stepTracer = makeNoopTracer();
  const runner = createRunner({
    agent: agentDef,
    backend: agentBackend,
    tracer: stepTracer,
  });

  await runner.run(input);

  return {
    jobId,
    completedSteps: Array.from(ledger),
  };
}
