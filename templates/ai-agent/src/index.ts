/**
 * ai-agent — multi-step ReAct agent on 0G Compute, attestation-verified per step.
 *
 * SP10 (`@foundryprotocol/0gkit-jobs`) hand-off: today the agent loop is
 * in-process. When SP10 lands, the `compute.inference(...)` call becomes
 * `jobs.enqueue("step", args)` + `handle.await()`. The deps-injection seam
 * in `src/agent.ts` makes the swap mechanical.
 *
 * Attestation provider: this template ships a stub `verifyStep` that always
 * returns true. In production, wire `verifyEnvelope` from `0gkit-attestation`
 * against a signed envelope that your 0G Compute provider returns alongside
 * the inference (or a separate attestation endpoint).
 */
import { Compute } from "@foundryprotocol/0gkit-compute";
import { fromEnv } from "@foundryprotocol/0gkit-wallet";
import { ZeroGError } from "@foundryprotocol/0gkit-core";
import { runAgent } from "./agent.js";
import { ToolRegistry } from "./tools.js";

async function main(): Promise<void> {
  const signer = await fromEnv();
  const network = (process.env.ZEROG_NETWORK ?? "galileo") as "galileo" | "aristotle";
  const compute = new Compute({ network, signer });

  const tools = new ToolRegistry();
  tools.register({
    name: "add",
    description: "Add two integers. args: { a: number, b: number }",
    handler: ({ a, b }: { a: number; b: number }) => ({ result: a + b }),
  });
  tools.register({
    name: "current_time",
    description: "Return the current ISO timestamp. args: {}",
    handler: () => ({ iso: new Date().toISOString() }),
  });

  const prompt = process.argv[2] ?? "What is 17 + 25? Use the add tool.";

  const result = await runAgent(prompt, {
    compute,
    tools,
    // STUB — replace with a real verifier in production. See the README's
    // "Wiring real attestation" section.
    verifyStep: async (_step, _res) => true,
    log: (m) => console.log(m),
    maxSteps: 5,
  });

  console.log("");
  console.log(`Agent result: ${result.kind}`);
  if (result.kind === "final") {
    console.log(`  Answer: ${result.answer}`);
  } else {
    console.log(`  Reason: ${result.reason}`);
  }
  console.log(`  Steps : ${result.steps.length}`);
  for (const [i, s] of result.steps.entries()) {
    console.log(
      `    [${i + 1}] tx=${s.receiptTxHash || "(none)"}${
        s.toolName ? ` tool=${s.toolName}` : ""
      }`
    );
  }
}

main().catch((err: unknown) => {
  if (err instanceof ZeroGError) {
    console.error(`\n${err.name}: ${err.message}`);
    if ("hint" in err && typeof err.hint === "string") {
      console.error(`Hint: ${err.hint}`);
    }
  } else {
    console.error(err);
  }
  process.exit(1);
});
