/**
 * durable-agent — lib unit tests (TDD-first)
 *
 * Proves:
 *   (a) Three steps run in order.
 *   (b) After a crash following step 2, resuming the runner does NOT re-run
 *       steps 1 or 2 — only step 3 runs (ledger replay / idempotent step keys).
 *   (c) Each step emits exactly one span via the injected mock tracer.
 *
 * No real @foundryprotocol/* package is imported — all deps are pure mocks.
 */

import { describe, it, expect, vi } from "vitest";
import { defineAgent, createRunner } from "../agent.js";
import type { StepTracer, AgentJobsBackend } from "../agent.js";

// ---------------------------------------------------------------------------
// Mock tracer (proves (c))
// ---------------------------------------------------------------------------

function makeMockTracer(): StepTracer & { spans: string[] } {
  const spans: string[] = [];
  return {
    spans,
    startSpan(name: string) {
      spans.push(name);
      return {
        end() {},
        setError(_e: unknown) {},
      };
    },
  };
}

// ---------------------------------------------------------------------------
// In-memory ledger backend (pure mock — no real package import)
//
// Simulates the step-level durability store: a Map<stepKey, "done">.
// This is the minimal interface `createRunner` needs from a "backend".
// ---------------------------------------------------------------------------

function makeMockBackend(): AgentJobsBackend & {
  completedKeys: Set<string>;
} {
  const completedKeys = new Set<string>();
  return {
    completedKeys,
    async getCompletedSteps(): Promise<Set<string>> {
      return new Set(completedKeys);
    },
    async markStepDone(key: string): Promise<void> {
      completedKeys.add(key);
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: build a 3-step agent definition
// ---------------------------------------------------------------------------

function buildThreeStepAgent(order: string[]) {
  return defineAgent({
    name: "test-agent",
    steps: [
      {
        key: "step-1",
        name: "Step One",
        run: async (_ctx) => {
          order.push("step-1");
        },
      },
      {
        key: "step-2",
        name: "Step Two",
        run: async (_ctx) => {
          order.push("step-2");
        },
      },
      {
        key: "step-3",
        name: "Step Three",
        run: async (_ctx) => {
          order.push("step-3");
        },
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("durable-agent lib", () => {
  it("(a) runs all 3 steps in order on a fresh backend", async () => {
    const order: string[] = [];
    const agent = buildThreeStepAgent(order);
    const backend = makeMockBackend();
    const tracer = makeMockTracer();

    const runner = createRunner({ agent, backend, tracer });
    await runner.run({});

    expect(order).toEqual(["step-1", "step-2", "step-3"]);
  });

  it("(b) resume after crash at step-3 does NOT re-run steps 1 and 2", async () => {
    const order: string[] = [];
    const agent = buildThreeStepAgent(order);

    // Simulate a backend where steps 1 and 2 are already completed
    const backend = makeMockBackend();
    backend.completedKeys.add("step-1");
    backend.completedKeys.add("step-2");

    const tracer = makeMockTracer();
    const runner = createRunner({ agent, backend, tracer });
    await runner.run({});

    // Only step-3 should have been executed
    expect(order).toEqual(["step-3"]);
  });

  it("(b) crash-after-step-2 replay: marks steps done and replays correctly", async () => {
    const orderFirst: string[] = [];
    const orderSecond: string[] = [];

    // First run: crash after step 2 (step 3 throws)
    const agentWithCrash = defineAgent({
      name: "crash-agent",
      steps: [
        {
          key: "step-1",
          name: "Step One",
          run: async (_ctx) => {
            orderFirst.push("step-1");
          },
        },
        {
          key: "step-2",
          name: "Step Two",
          run: async (_ctx) => {
            orderFirst.push("step-2");
          },
        },
        {
          key: "step-3-crash",
          name: "Step Three (crashes)",
          run: async (_ctx) => {
            orderFirst.push("step-3-crash");
            throw new Error("simulated crash at step 3");
          },
        },
      ],
    });

    const backend = makeMockBackend();
    const tracer1 = makeMockTracer();
    const runner1 = createRunner({ agent: agentWithCrash, backend, tracer: tracer1 });

    // First run crashes at step 3
    await expect(runner1.run({})).rejects.toThrow("simulated crash at step 3");

    // Steps 1 and 2 were completed and persisted
    expect(backend.completedKeys.has("step-1")).toBe(true);
    expect(backend.completedKeys.has("step-2")).toBe(true);
    expect(backend.completedKeys.has("step-3-crash")).toBe(false);

    // Second run (resume): same backend — steps 1+2 already in ledger
    const agentFixed = defineAgent({
      name: "crash-agent",
      steps: [
        {
          key: "step-1",
          name: "Step One",
          run: async (_ctx) => {
            orderSecond.push("step-1");
          },
        },
        {
          key: "step-2",
          name: "Step Two",
          run: async (_ctx) => {
            orderSecond.push("step-2");
          },
        },
        {
          key: "step-3-crash",
          name: "Step Three (fixed)",
          run: async (_ctx) => {
            orderSecond.push("step-3-fixed");
          },
        },
      ],
    });

    const tracer2 = makeMockTracer();
    const runner2 = createRunner({ agent: agentFixed, backend, tracer: tracer2 });
    await runner2.run({});

    // Only step-3 ran in the second run (step-1 and step-2 were skipped)
    expect(orderSecond).toEqual(["step-3-fixed"]);
    // No span for steps 1 and 2 on resume — they were skipped
    expect(tracer2.spans).toEqual(["step-3-crash"]);
  });

  it("(c) each executed step emits exactly one span via the injected tracer", async () => {
    const order: string[] = [];
    const agent = buildThreeStepAgent(order);
    const backend = makeMockBackend();
    const tracer = makeMockTracer();

    const runner = createRunner({ agent, backend, tracer });
    await runner.run({});

    // One span per step key, in order
    expect(tracer.spans).toEqual(["step-1", "step-2", "step-3"]);
  });

  it("(c) skipped steps (already done) do NOT emit spans", async () => {
    const order: string[] = [];
    const agent = buildThreeStepAgent(order);

    const backend = makeMockBackend();
    backend.completedKeys.add("step-1");

    const tracer = makeMockTracer();
    const runner = createRunner({ agent, backend, tracer });
    await runner.run({});

    // Only steps 2 and 3 should emit spans
    expect(tracer.spans).toEqual(["step-2", "step-3"]);
    expect(order).toEqual(["step-2", "step-3"]);
  });

  it("span.setError is called on step failure", async () => {
    const errorAgent = defineAgent({
      name: "error-agent",
      steps: [
        {
          key: "step-ok",
          name: "OK step",
          run: async (_ctx) => {},
        },
        {
          key: "step-fail",
          name: "Failing step",
          run: async (_ctx) => {
            throw new Error("step failure");
          },
        },
      ],
    });

    const backend = makeMockBackend();
    const setErrorCalls: unknown[] = [];
    const tracer: StepTracer = {
      startSpan(_name: string) {
        return {
          end() {},
          setError(e: unknown) {
            setErrorCalls.push(e);
          },
        };
      },
    };

    const runner = createRunner({ agent: errorAgent, backend, tracer });
    await expect(runner.run({})).rejects.toThrow("step failure");

    expect(setErrorCalls.length).toBe(1);
    expect(setErrorCalls[0]).toBeInstanceOf(Error);
  });
});
