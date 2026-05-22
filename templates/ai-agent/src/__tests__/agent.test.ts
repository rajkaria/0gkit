import { describe, expect, it, vi } from "vitest";
import type {
  ChatMessage,
  InferenceResult,
} from "@foundryprotocol/0gkit-compute";
import { runAgent, type AgentDeps } from "../agent.js";
import { ToolRegistry } from "../tools.js";

function fakeInference(responses: string[]): AgentDeps["compute"] {
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

function makeDeps(
  responses: string[],
  overrides: Partial<AgentDeps> = {}
): AgentDeps {
  const tools = new ToolRegistry();
  tools.register({
    name: "add",
    description: "Add two numbers.",
    handler: ({ a, b }: { a: number; b: number }) => ({ result: a + b }),
  });
  return {
    compute: fakeInference(responses),
    tools,
    verifyStep: vi.fn().mockResolvedValue(true),
    log: () => undefined,
    maxSteps: 3,
    ...overrides,
  };
}

describe("runAgent", () => {
  it("terminates with a final answer when the model emits 'done'", async () => {
    const deps = makeDeps(['{"action":"done","answer":"42"}']);
    const result = await runAgent("what is 41+1?", deps);
    expect(result.kind).toBe("final");
    if (result.kind !== "final") return;
    expect(result.answer).toBe("42");
    expect(result.steps).toHaveLength(1);
  });

  it("invokes tools when the model returns a 'tool' action", async () => {
    const deps = makeDeps([
      '{"action":"tool","name":"add","args":{"a":2,"b":3}}',
      '{"action":"done","answer":"5"}',
    ]);
    const result = await runAgent("2+3?", deps);
    expect(result.kind).toBe("final");
    if (result.kind !== "final") return;
    expect(result.answer).toBe("5");
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]?.toolName).toBe("add");
    expect(result.steps[0]?.toolResult).toEqual({ result: 5 });
  });

  it("aborts when maxSteps is reached", async () => {
    const deps = makeDeps(['{"action":"tool","name":"add","args":{"a":1,"b":1}}'], {
      maxSteps: 1,
    });
    const result = await runAgent("loop forever", deps);
    expect(result.kind).toBe("abort");
    if (result.kind !== "abort") return;
    expect(result.reason).toMatch(/max steps/);
  });

  it("aborts when verifyStep returns false", async () => {
    const verifyStep = vi.fn().mockResolvedValue(false);
    const deps = makeDeps(['{"action":"done","answer":"ok"}'], { verifyStep });
    const result = await runAgent("hi", deps);
    expect(result.kind).toBe("abort");
    if (result.kind !== "abort") return;
    expect(result.reason).toMatch(/attestation/i);
  });

  it("aborts when the model asks for an unknown tool", async () => {
    const deps = makeDeps(['{"action":"tool","name":"divide","args":{}}']);
    const result = await runAgent("divide?", deps);
    expect(result.kind).toBe("abort");
    if (result.kind !== "abort") return;
    expect(result.reason).toMatch(/unknown tool/);
  });

  it("treats non-JSON responses as a final answer", async () => {
    const deps = makeDeps(["I think the answer is 42 — and I'm confident."]);
    const result = await runAgent("explain", deps);
    expect(result.kind).toBe("final");
    if (result.kind !== "final") return;
    expect(result.answer).toMatch(/42/);
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
