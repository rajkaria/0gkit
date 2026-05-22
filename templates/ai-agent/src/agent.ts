import type { ChatMessage, InferenceResult } from "@foundryprotocol/0gkit-compute";
import type { ToolRegistry } from "./tools.js";

export interface AgentDeps {
  compute: {
    inference(args: { messages: ChatMessage[] }): Promise<InferenceResult>;
  };
  tools: ToolRegistry;
  /**
   * Called after every compute step. Return false to abort the loop —
   * production wires this to `@foundryprotocol/0gkit-attestation`'s
   * `verifyEnvelope` against an attestation envelope fetched per-step.
   */
  verifyStep: (stepIndex: number, result: InferenceResult) => Promise<boolean>;
  log: (m: string) => void;
  maxSteps: number;
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
    // fall through to default done-with-raw
  }
  return { action: "done", answer: trimmed };
}

export async function runAgent(prompt: string, deps: AgentDeps): Promise<AgentResult> {
  const { compute, tools, verifyStep, log, maxSteps } = deps;
  const steps: AgentStep[] = [];

  const toolDoc = tools
    .list()
    .map((t) => `- ${t.name}: ${t.description}`)
    .join("\n");
  let history = `User: ${prompt}\n\nTools:\n${toolDoc}\n\nRespond as JSON: {"action":"tool","name":"<tool>","args":{...}} or {"action":"done","answer":"..."}.`;

  for (let i = 0; i < maxSteps; i += 1) {
    const res = await compute.inference({
      messages: [{ role: "user", content: history }],
    });

    const ok = await verifyStep(i, res);
    if (!ok) {
      return {
        kind: "abort",
        reason: `step ${i + 1}: attestation did not verify`,
        steps,
      };
    }

    const decision = parseDecision(res.output);
    log(`step ${i + 1}: action=${decision.action} ${decision.name ?? ""}`);

    const receiptTxHash = String(res.receipt.txHash ?? "");

    if (decision.action === "done") {
      steps.push({
        prompt: history,
        rawResponse: res.output,
        receiptTxHash,
      });
      return { kind: "final", answer: decision.answer ?? res.output, steps };
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
      rawResponse: res.output,
      toolName: decision.name,
      toolArgs: decision.args,
      toolResult,
      receiptTxHash,
    });
    history += `\n\nTool "${decision.name}" returned: ${JSON.stringify(toolResult)}`;
  }

  return { kind: "abort", reason: `max steps (${maxSteps}) exceeded`, steps };
}
