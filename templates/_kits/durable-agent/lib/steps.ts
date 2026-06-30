/**
 * durable-agent — sample multi-step pipeline
 *
 * Provides a ready-made research → act → record pipeline as a reference and
 * starting point. Each step is exported individually so apps can compose them
 * into a custom pipeline via defineAgent({ steps: [...] }).
 *
 * Optional sealed-inference step
 * ────────────────────────────────
 * researchStep will use the sealed-inference client if it is present on ctx
 * (CAPABILITY-GUARDED — runtime check). This means:
 *   - No hard import of any inference package in this file.
 *   - Adapters that have the capability inject ctx.sealedInference.
 *   - Adapters without it leave ctx.sealedInference = null and the step
 *     falls back to a placeholder output.
 */

import type { AgentStep, StepContext } from "./agent.js";

// ---------------------------------------------------------------------------
// Step: research
// ---------------------------------------------------------------------------

/**
 * Research step — calls the sealed-inference client if available (capability-
 * guarded), or returns a placeholder result if not.
 *
 * In the agent ledger this step is keyed "research" and is idempotent:
 * if the run was previously completed successfully it will be skipped on
 * resume.
 */
export const researchStep: AgentStep = {
  key: "research",
  name: "Research",
  async run(ctx: StepContext): Promise<void> {
    if (ctx.sealedInference != null) {
      // Capability-guarded: use the injected sealed-inference client
      const prompt =
        typeof ctx.input["prompt"] === "string"
          ? ctx.input["prompt"]
          : "Summarize the current state of the 0G network.";
      const model =
        typeof ctx.input["model"] === "string" ? ctx.input["model"] : undefined;

      const result = await ctx.sealedInference.infer({ prompt, model });

      // Persist result to context for downstream steps
      // Note: ctx.input is the raw input — we add research output here
      // using a well-known key that actStep and recordStep can read.
      (ctx.input as Record<string, unknown>)["__research_output"] = result.output;
    } else {
      // No inference capability — use a deterministic placeholder
      (ctx.input as Record<string, unknown>)["__research_output"] =
        "[research placeholder — no inference capability available]";
    }
  },
};

// ---------------------------------------------------------------------------
// Step: act
// ---------------------------------------------------------------------------

/**
 * Act step — processes the research output and produces an action result.
 * In a real application this might call an external API, write a transaction,
 * or trigger a downstream agent.
 *
 * Idempotent key: "act". Skipped on resume if already completed.
 */
export const actStep: AgentStep = {
  key: "act",
  name: "Act",
  async run(ctx: StepContext): Promise<void> {
    const research = ctx.input["__research_output"] ?? "(no research output)";
    // Simulate acting on the research output (e.g. selecting an action, posting a tx)
    const actionResult = `action:based-on:${String(research).slice(0, 64)}`;
    (ctx.input as Record<string, unknown>)["__action_result"] = actionResult;
  },
};

// ---------------------------------------------------------------------------
// Step: record
// ---------------------------------------------------------------------------

/**
 * Record step — persists the action result (e.g. to 0G Storage, a database,
 * or an audit log). In the sample pipeline this is a no-op placeholder;
 * adapters should replace ctx with an output sink if needed.
 *
 * Idempotent key: "record". Skipped on resume if already completed.
 */
export const recordStep: AgentStep = {
  key: "record",
  name: "Record",
  async run(ctx: StepContext): Promise<void> {
    // In a real implementation: serialize ctx.input["__action_result"] and upload
    // to 0G Storage, write to a database, or publish an event.
    // This placeholder is intentionally minimal so the sample compiles on every base.
    void ctx; // acknowledge ctx to satisfy TypeScript strict mode
  },
};

// ---------------------------------------------------------------------------
// Ready-made pipeline
// ---------------------------------------------------------------------------

/**
 * Default three-step pipeline: research → act → record.
 * Pass to defineAgent({ steps: defaultPipeline }).
 */
export const defaultPipeline: AgentStep[] = [researchStep, actStep, recordStep];
