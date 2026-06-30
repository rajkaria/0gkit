/**
 * durable-agent — portable core
 *
 * Dependency-free: accepts injected { backend, tracer } so the lib works on
 * every base template and is fully unit-testable with mocks.
 *
 * Step-level durability
 * ──────────────────────
 * Each step has an idempotent `key`. Before running a step the runner checks
 * the backend's completed-step ledger. If the key is already there, the step
 * is SKIPPED (no re-execution, no span). After a step succeeds its key is
 * written to the ledger. On resume (same backend) completed steps are thus
 * never re-run.
 *
 * Tracing
 * ────────
 * The lib defines a minimal `StepTracer` interface. Adapters inject the real
 * OpenTelemetry tracer (`@opentelemetry/api`). Each EXECUTED step opens a
 * span (startSpan → end). On step failure, setError is called before end.
 * Skipped steps emit no span.
 *
 * Sealed-inference capability guard
 * ───────────────────────────────────
 * The optional `sealedInference` context property is CAPABILITY-GUARDED.
 * `lib/steps.ts` checks `ctx.sealedInference != null` before using it.
 * No hard import or hard dep on any inference package.
 */

// ---------------------------------------------------------------------------
// Injected interfaces
// ---------------------------------------------------------------------------

/**
 * Minimal tracer interface injected by adapters/tests.
 * Adapters wire the real OpenTelemetry tracer; tests inject a mock.
 * Skipped steps are NEVER traced.
 */
export interface StepTracer {
  startSpan(name: string): {
    end(): void;
    setError?(e: unknown): void;
  };
}

/**
 * Minimal backend interface for step-level ledger persistence.
 * Adapters may back this with the real 0gkit-jobs JobBackend (persisted in
 * the jobs backend's storage) or a simple in-process Map for dev/test.
 *
 * The lib ONLY needs the completed-step ledger — it does NOT need the full
 * JobRunner job-dispatch mechanism. Adapters may compose this interface on
 * top of JobRunner (storing completed keys in job metadata / a side channel)
 * or provide a standalone implementation.
 */
export interface AgentJobsBackend {
  /** Return the set of step keys that have already completed. */
  getCompletedSteps(): Promise<Set<string>>;
  /** Persist that the step with the given key has completed. */
  markStepDone(key: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Step definition
// ---------------------------------------------------------------------------

/** Context passed to each step at runtime. */
export interface StepContext {
  /** Input payload passed to runner.run(). */
  input: Record<string, unknown>;
  /**
   * Optional sealed-inference client — CAPABILITY-GUARDED.
   * Present only when the adapter injects it. Steps MUST check for null.
   */
  sealedInference?: {
    infer(args: { prompt: string; model?: string }): Promise<{ output: string }>;
  } | null;
}

export interface AgentStep {
  /**
   * Idempotent key — uniquely identifies this step within the agent.
   * Used as the ledger key for durability. Must be stable across runs.
   */
  key: string;
  /** Human-readable name — used as the OTel span name. */
  name: string;
  /** The step logic. Throwing rejects run(); the step is NOT marked done. */
  run(ctx: StepContext): Promise<void>;
}

// ---------------------------------------------------------------------------
// Agent definition
// ---------------------------------------------------------------------------

export interface AgentDefinition {
  name: string;
  steps: AgentStep[];
}

/**
 * Define an agent. Pure data — no execution happens here.
 * Returns the same object with its type narrowed for use with createRunner.
 */
export function defineAgent(def: AgentDefinition): AgentDefinition {
  return def;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export interface RunnerDeps {
  agent: AgentDefinition;
  backend: AgentJobsBackend;
  tracer: StepTracer;
}

export interface AgentRunner {
  /**
   * Execute the agent with the given input.
   *
   * For each step:
   *   - If the step key is in the ledger → SKIP (no span emitted).
   *   - Otherwise: open a span, run the step, mark done, close span.
   *   - On step failure: call span.setError, close span, re-throw.
   *
   * Idempotent: calling run() on a completed agent is a no-op (all steps
   * already in ledger). On resume after crash only the not-yet-done steps run.
   */
  run(input: Record<string, unknown>): Promise<void>;
}

// ---------------------------------------------------------------------------
// No-op tracer (useful for adapters that don't wire OTel — e.g. mcp-agent,
// storage-app where @opentelemetry/api is not installed in the base)
// ---------------------------------------------------------------------------

/**
 * Returns a tracer that emits no real spans. Use this in adapters where
 * OpenTelemetry is not configured or available in the base template.
 * Swap in a real OTel tracer (from @opentelemetry/api) for production observability.
 */
export function makeNoopTracer(): StepTracer {
  return {
    startSpan(_name: string) {
      return {
        end() {},
        setError(_e: unknown) {},
      };
    },
  };
}

/**
 * Create a resumable agent runner with the given injected deps.
 */
export function createRunner(deps: RunnerDeps): AgentRunner {
  const { agent, backend, tracer } = deps;

  return {
    async run(input: Record<string, unknown>): Promise<void> {
      // Load the current ledger once before starting (snapshot for this run)
      const completed = await backend.getCompletedSteps();

      const ctx: StepContext = {
        input,
        sealedInference: null,
      };

      for (const step of agent.steps) {
        // SKIP steps already completed (idempotent resume)
        if (completed.has(step.key)) {
          continue;
        }

        // Start a span for this step (only executed steps are traced)
        const span = tracer.startSpan(step.key);

        try {
          await step.run(ctx);
          // Mark the step as done in the ledger BEFORE closing the span
          await backend.markStepDone(step.key);
          span.end();
        } catch (err) {
          span.setError?.(err);
          span.end();
          // Re-throw — step is NOT marked done, so a resume will retry it
          throw err;
        }
      }
    },
  };
}
