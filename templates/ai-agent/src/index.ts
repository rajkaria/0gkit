/**
 * ai-agent — multi-step ReAct agent on 0G Compute, attestation-verified per step,
 * orchestrated via @foundryprotocol/0gkit-jobs.
 *
 * Every ReAct iteration is enqueued as a durable `agent.step` job. With the
 * default `MemoryBackend` the loop is in-process (no extra infra); swap to
 * `SqliteBackend` (single-node prod) or `RedisBackend` (multi-node prod) by
 * changing one line — see README "Durable backends" section.
 *
 * Attestation provider: this template ships a stub `verifyStep` that always
 * returns true. In production, wire `verifyEnvelope` from `0gkit-attestation`
 * against a signed envelope that your 0G Compute provider returns alongside
 * the inference (or a separate attestation endpoint).
 */
import { Compute } from "@foundryprotocol/0gkit-compute";
import { fromPrivateKey } from "@foundryprotocol/0gkit-wallet";
import {
  ZeroGError,
  detectLocalDevnet,
  printFirstSuccess,
} from "@foundryprotocol/0gkit-core";
import { JobRunner } from "@foundryprotocol/0gkit-jobs";
import { MemoryBackend } from "@foundryprotocol/0gkit-jobs/backends/memory";
import { buildStepJob, runAgent } from "./agent.js";
import { ToolRegistry } from "./tools.js";
import { config } from "../0g.config.js";

async function main(): Promise<void> {
  const env = config.server();
  let network: "galileo" | "aristotle" | "local" = env.ZEROG_NETWORK;
  if (network === "galileo" && (await detectLocalDevnet())) {
    console.warn("[0gkit] Local devnet detected — using network=local.");
    network = "local";
  }

  const signer = await fromPrivateKey(env.BROKER_KEY);
  // Compute SDK currently accepts only "aristotle" | "galileo"; "local" is
  // surfaced through unchanged so users hit a clear SDK error rather than a
  // silent retarget to mainnet.
  const compute = new Compute({
    network: network as "galileo" | "aristotle",
    signer,
    ...(env.PROVIDER ? { provider: env.PROVIDER } : {}),
    ...(env.MODEL ? { model: env.MODEL } : {}),
  });

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

  const runner = new JobRunner({ backend: new MemoryBackend(), signer });
  const stepJob = buildStepJob({
    compute,
    // STUB — replace with a real verifier in production. See README's
    // "Wiring real attestation" section.
    verifyStep: async () => true,
  });
  runner.register(stepJob);
  await runner.start({ concurrency: 1 });

  const prompt = process.argv[2] ?? "What is 17 + 25? Use the add tool.";

  try {
    const result = await runAgent(prompt, {
      runner,
      stepJob,
      tools,
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

    if (result.kind === "final" && result.steps.length > 0) {
      const firstReceipt = result.steps[0]?.receiptTxHash;
      printFirstSuccess({
        op: "compute.inference",
        id: firstReceipt && firstReceipt.length > 0 ? firstReceipt : "ok",
        note: `network=${network}`,
      });
    }
  } finally {
    await runner.stop({ drain: true, timeoutMs: 5000 });
  }
}

main().catch((err: unknown) => {
  if (err instanceof ZeroGError) {
    console.error(`\n${err.name}: ${err.message}`);
    if ("hint" in err && typeof err.hint === "string") {
      console.error(`Hint: ${err.hint}`);
    }
    if ("helpUrl" in err && typeof err.helpUrl === "string") {
      console.error(`Help: ${err.helpUrl}`);
    }
  } else {
    console.error(err);
  }
  process.exit(1);
});
