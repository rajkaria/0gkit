import { describe, expect, it, vi, afterEach } from "vitest";
import type { ChatMessage, InferenceResult } from "@foundryprotocol/0gkit-compute";
import { testWallet } from "@foundryprotocol/0gkit-testing";
import { JobRunner } from "@foundryprotocol/0gkit-jobs";
import { MemoryBackend } from "@foundryprotocol/0gkit-jobs/backends/memory";
import { buildStepJob, runAgent, type AgentDeps, type StepDeps } from "../agent.js";
import { ToolRegistry } from "../tools.js";

function fakeCompute(responses: string[]): StepDeps["compute"] {
  let i = 0;
  return {
    inference: async (_args: { messages: ChatMessage[] }) => {
      const output = responses[Math.min(i, responses.length - 1)] ?? "";
      i += 1;
      return {
        output,
        receipt: { txHash: `0x${i.toString(16).padStart(64, "0")}`, latencyMs: 1 },
        raw: { mock: true },
      } as InferenceResult;
    },
  };
}

interface Harness {
  runner: JobRunner;
  deps: AgentDeps;
  cleanup: () => Promise<void>;
}

async function makeHarness(
  responses: string[],
  overrides: {
    verifyStep?: StepDeps["verifyStep"];
    maxSteps?: number;
    tools?: ToolRegistry;
  } = {}
): Promise<Harness> {
  const tools =
    overrides.tools ??
    (() => {
      const r = new ToolRegistry();
      r.register({
        name: "add",
        description: "Add two numbers.",
        handler: ({ a, b }: { a: number; b: number }) => ({ result: a + b }),
      });
      return r;
    })();
  const backend = new MemoryBackend();
  const runner = new JobRunner({ backend, signer: testWallet({ index: 0 }) });
  const stepJob = buildStepJob({
    compute: fakeCompute(responses),
    verifyStep: overrides.verifyStep ?? vi.fn().mockResolvedValue(true),
  });
  runner.register(stepJob);
  await runner.start({ concurrency: 1 });
  const deps: AgentDeps = {
    runner,
    stepJob,
    tools,
    log: () => undefined,
    maxSteps: overrides.maxSteps ?? 3,
    stepTimeoutMs: 2000,
  };
  return {
    runner,
    deps,
    cleanup: async () => runner.stop({ drain: true, timeoutMs: 500 }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runAgent", () => {
  it("terminates with a final answer when the model emits 'done'", async () => {
    const h = await makeHarness(['{"action":"done","answer":"42"}']);
    try {
      const result = await runAgent("what is 41+1?", h.deps);
      expect(result.kind).toBe("final");
      if (result.kind !== "final") return;
      expect(result.answer).toBe("42");
      expect(result.steps).toHaveLength(1);
    } finally {
      await h.cleanup();
    }
  });

  it("invokes tools when the model returns a 'tool' action", async () => {
    const h = await makeHarness([
      '{"action":"tool","name":"add","args":{"a":2,"b":3}}',
      '{"action":"done","answer":"5"}',
    ]);
    try {
      const result = await runAgent("2+3?", h.deps);
      expect(result.kind).toBe("final");
      if (result.kind !== "final") return;
      expect(result.answer).toBe("5");
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0]?.toolName).toBe("add");
      expect(result.steps[0]?.toolResult).toEqual({ result: 5 });
    } finally {
      await h.cleanup();
    }
  });

  it("aborts when maxSteps is reached", async () => {
    const h = await makeHarness(
      ['{"action":"tool","name":"add","args":{"a":1,"b":1}}'],
      {
        maxSteps: 1,
      }
    );
    try {
      const result = await runAgent("loop forever", h.deps);
      expect(result.kind).toBe("abort");
      if (result.kind !== "abort") return;
      expect(result.reason).toMatch(/max steps/);
    } finally {
      await h.cleanup();
    }
  });

  it("aborts when verifyStep returns false", async () => {
    const verifyStep = vi.fn().mockResolvedValue(false);
    const h = await makeHarness(['{"action":"done","answer":"ok"}'], { verifyStep });
    try {
      const result = await runAgent("hi", h.deps);
      expect(result.kind).toBe("abort");
      if (result.kind !== "abort") return;
      expect(result.reason).toMatch(/attestation/i);
    } finally {
      await h.cleanup();
    }
  });

  it("aborts when the model asks for an unknown tool", async () => {
    const h = await makeHarness(['{"action":"tool","name":"divide","args":{}}']);
    try {
      const result = await runAgent("divide?", h.deps);
      expect(result.kind).toBe("abort");
      if (result.kind !== "abort") return;
      expect(result.reason).toMatch(/unknown tool/);
    } finally {
      await h.cleanup();
    }
  });

  it("treats non-JSON responses as a final answer", async () => {
    const h = await makeHarness(["I think the answer is 42 — and I'm confident."]);
    try {
      const result = await runAgent("explain", h.deps);
      expect(result.kind).toBe("final");
      if (result.kind !== "final") return;
      expect(result.answer).toMatch(/42/);
    } finally {
      await h.cleanup();
    }
  });

  it("aborts when the step job fails after exhausting retries", async () => {
    const tools = new ToolRegistry();
    const backend = new MemoryBackend();
    const runner = new JobRunner({ backend, signer: testWallet({ index: 0 }) });
    const stepJob = buildStepJob({
      compute: {
        inference: async () => {
          throw new Error("compute provider unreachable");
        },
      },
      verifyStep: async () => true,
    });
    runner.register(stepJob);
    await runner.start({ concurrency: 1 });
    try {
      const result = await runAgent("hi", {
        runner,
        stepJob,
        tools,
        log: () => undefined,
        maxSteps: 1,
        stepTimeoutMs: 2000,
      });
      expect(result.kind).toBe("abort");
      if (result.kind !== "abort") return;
      expect(result.reason).toMatch(/failed/);
      expect(result.reason).toMatch(/compute provider unreachable/);
    } finally {
      await runner.stop({ drain: true, timeoutMs: 500 });
    }
  });
});

describe("ToolRegistry", () => {
  it("registers and invokes a tool", async () => {
    const reg = new ToolRegistry();
    reg.register({
      name: "echo",
      description: "echo args",
      handler: (args: unknown) => args,
    });
    expect(reg.has("echo")).toBe(true);
    expect(reg.list()).toEqual([{ name: "echo", description: "echo args" }]);
    expect(await reg.invoke("echo", { hi: 1 })).toEqual({ hi: 1 });
  });

  it("throws on unknown tool invocation", async () => {
    const reg = new ToolRegistry();
    await expect(reg.invoke("nope", {})).rejects.toThrow(/not registered/);
  });
});
