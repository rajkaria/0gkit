import { z } from "zod";
import { jobs, type JobRunner, type JobDefinition } from "@foundryprotocol/0gkit-jobs";
import type { ChatMessage, InferenceResult } from "@foundryprotocol/0gkit-compute";
import type { ToolRegistry } from "./tools.js";

export interface AgentDeps {
  /**
   * `JobRunner` instance with `StepJob` (from `buildStepJob`) registered.
   * The agent enqueues one `StepJob` per ReAct iteration and awaits it via
   * `runner.waitFor` — the loop survives an in-process crash if the backend
   * is durable (sqlite / redis) and a worker is restarted.
   */
  runner: JobRunner;
  stepJob: JobDefinition<StepInput, StepOutput>;
  tools: ToolRegistry;
  log: (m: string) => void;
  maxSteps: number;
  /** waitFor() timeout per step, defaults to 60s. */
  stepTimeoutMs?: number;
}

export interface AgentStep {
  prompt: string;
  rawResponse: string;
  toolName?: string;
  toolArgs?: unknown;
  toolResult?: unknown;
  receiptTxHash: string;
}

export type AgentResult =
  | { kind: "final"; answer: string; steps: AgentStep[] }
  | { kind: "abort"; reason: string; steps: AgentStep[] };

interface Decision {
  action: "tool" | "done";
  name?: string;
  args?: unknown;
  answer?: string;
}

function parseDecision(raw: string): Decision {
  const trimmed = raw.trim();
  try {
    const obj = JSON.parse(trimmed) as Decision;
    if (obj.action === "tool" || obj.action === "done") return obj;
  } catch {
    // fall through
  }
  return { action: "done", answer: trimmed };
}

/* ─────────────── StepJob: one ReAct iteration as a durable job ─────────────── */

export const StepInputSchema = z.object({
  stepIndex: z.number().int().nonnegative(),
  history: z.string(),
});
export type StepInput = z.infer<typeof StepInputSchema>;

export const StepOutputSchema = z.object({
  output: z.string(),
  receiptTxHash: z.string(),
  verified: z.boolean(),
});
export type StepOutput = z.infer<typeof StepOutputSchema>;

export interface StepDeps {
  compute: {
    inference(args: { messages: ChatMessage[] }): Promise<InferenceResult>;
  };
  /**
   * Called after every compute step. Return false to abort the loop — production
   * wires this to `@foundryprotocol/0gkit-attestation`'s `verifyEnvelope`.
   */
  verifyStep: (stepIndex: number, result: InferenceResult) => Promise<boolean>;
}

/**
 * Build the StepJob definition. Caller must register it on a JobRunner via
 * `runner.register(stepJob)` before passing it to `runAgent`.
 */
export function buildStepJob(deps: StepDeps): JobDefinition<StepInput, StepOutput> {
  return jobs.define({
    name: "agent.step",
    input: StepInputSchema,
    output: StepOutputSchema,
    handler: async ({ input }) => {
      const res = await deps.compute.inference({
        messages: [{ role: "user", content: input.history }],
      });
      const verified = await deps.verifyStep(input.stepIndex, res);
      return {
        output: res.output,
        receiptTxHash: String(res.receipt.txHash ?? ""),
        verified,
      };
    },
    maxAttempts: 2,
    backoffMs: (attempt) => 100 * attempt,
  });
}

/* ─────────────────────── top-level orchestration loop ─────────────────────── */

export async function runAgent(prompt: string, deps: AgentDeps): Promise<AgentResult> {
  const { runner, stepJob, tools, log, maxSteps } = deps;
  const stepTimeoutMs = deps.stepTimeoutMs ?? 60_000;
  const steps: AgentStep[] = [];

  const toolDoc = tools
    .list()
    .map((t) => `- ${t.name}: ${t.description}`)
    .join("\n");
  let history = `User: ${prompt}\n\nTools:\n${toolDoc}\n\nRespond as JSON: {"action":"tool","name":"<tool>","args":{...}} or {"action":"done","answer":"..."}.`;

  for (let i = 0; i < maxSteps; i += 1) {
    const jobId = await runner.enqueue(stepJob, { stepIndex: i, history });
    const rec = await runner.waitFor(jobId, { timeoutMs: stepTimeoutMs });

    if (rec.state !== "done") {
      return {
        kind: "abort",
        reason: `step ${i + 1}: job ${rec.state}${rec.error ? ` (${rec.error})` : ""}`,
        steps,
      };
    }

    const result = rec.result as StepOutput;
    if (!result.verified) {
      return {
        kind: "abort",
        reason: `step ${i + 1}: attestation did not verify`,
        steps,
      };
    }

    const decision = parseDecision(result.output);
    log(`step ${i + 1}: action=${decision.action} ${decision.name ?? ""}`);

    if (decision.action === "done") {
      steps.push({
        prompt: history,
        rawResponse: result.output,
        receiptTxHash: result.receiptTxHash,
      });
      return { kind: "final", answer: decision.answer ?? result.output, steps };
    }

    if (!decision.name || !tools.has(decision.name)) {
      return {
        kind: "abort",
        reason: `step ${i + 1}: model asked for unknown tool "${decision.name}"`,
        steps,
      };
    }
    const toolResult = await tools.invoke(decision.name, decision.args);
    steps.push({
      prompt: history,
      rawResponse: result.output,
      toolName: decision.name,
      toolArgs: decision.args,
      toolResult,
      receiptTxHash: result.receiptTxHash,
    });
    history += `\n\nTool "${decision.name}" returned: ${JSON.stringify(toolResult)}`;
  }

  return { kind: "abort", reason: `max steps (${maxSteps}) exceeded`, steps };
}
