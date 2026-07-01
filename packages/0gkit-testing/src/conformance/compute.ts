import type { SuiteResult, SuiteDeps } from "./index.js";

const PROBE_MESSAGES = [
  { role: "user" as const, content: "ping" },
] satisfies { role: "system" | "user" | "assistant"; content: string }[];

export async function computeSuite(
  deps: Pick<SuiteDeps, "makeCompute">
): Promise<SuiteResult> {
  const compute = deps.makeCompute();
  const { output } = await compute.inference({ messages: PROBE_MESSAGES });
  const ok = typeof output === "string" && output.length > 0;
  return {
    name: "compute",
    ok,
    detail: ok
      ? `inference returned non-empty output (${output.length} chars)`
      : "inference returned empty output",
  };
}
