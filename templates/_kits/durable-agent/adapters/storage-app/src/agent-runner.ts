/**
 * durable-agent — storage-app adapter
 *
 * Node.js module that runs the durable agent loop in the storage-app context.
 * The storage-app base is a Node.js script (not Next.js / Hono), so this
 * adapter exports a runDurableAgent() function that can be called from
 * the base's src/index.ts or triggered as a standalone CLI step.
 *
 * Durability model
 * ─────────────────
 * DURABLE (survives restarts):
 *   - Step ledger — completed step keys serialized to JSON and uploaded to 0G Storage
 *     (content-addressed root-registry pattern, exactly like the agent-memory kit).
 *     Pass `storageRootHint` from a prior run's result to restore the ledger on cold
 *     start — the root hash is the durable pointer to that run's completed-steps blob.
 *
 * NOT durable (in-process only):
 *   - JobRunner / MemoryBackend — used to enqueue/run the agent as a real 0gkit-jobs
 *     job within this process. Swap in SqliteBackend for cross-process job durability.
 *
 * Tracing
 * ────────
 * No-op tracer: storage-app base does not ship @opentelemetry/api. Documented
 * intentionally — add @opentelemetry/api as a dep and inject an OTel tracer to
 * enable real span emission.
 *
 * Usage (in src/index.ts):
 *   import { runDurableAgent } from "./agent-runner.js";
 *   const result = await runDurableAgent({ input: { prompt: "Hello 0G!" } });
 *   // On next call, pass result.storageRoot to resume:
 *   // await runDurableAgent({ input: { prompt: "..." }, storageRootHint: result.storageRoot });
 *
 * Environment variables (set in .env):
 *   OG_PRIVATE_KEY          — 0x-prefixed private key (required)
 *   OG_RPC_URL              — 0G chain RPC URL (required)
 *   OG_STORAGE_NAMESPACE    — blob namespace prefix (default: "durable-agent")
 *   OG_JOBS_BACKEND         — informational; "memory" (default) or "sqlite"
 */

// NOTE: Adapters MAY import 0gkit packages.
// @opentelemetry/api is NOT a dep of storage-app base — using no-op tracer (documented above).
import { z } from "zod";
import { JobRunner, jobs } from "@foundryprotocol/0gkit-jobs";
import { MemoryBackend } from "@foundryprotocol/0gkit-jobs/backends/memory";
// SQLite backend for cross-process job durability:
//   import { SqliteBackend } from "@foundryprotocol/0gkit-jobs/backends/sqlite";
import { fromPrivateKey } from "@foundryprotocol/0gkit-wallet";
import { Storage, type StorageConfig } from "@foundryprotocol/0gkit-storage";

import {
  defineAgent,
  createRunner,
  makeNoopTracer,
  type AgentJobsBackend,
} from "../agent.js";
import { defaultPipeline } from "../steps.js";

// ---------------------------------------------------------------------------
// Public options
// ---------------------------------------------------------------------------

export interface RunDurableAgentOptions {
  /**
   * Optional input payload passed to each step.
   * Example: { prompt: "Summarize the 0G network." }
   */
  input?: Record<string, unknown>;
  /**
   * Optional job ID for ledger keying (used to resume a prior run).
   * If omitted, a new unique ID is generated and returned.
   */
  jobId?: string;
  /**
   * Optional 0G Storage root hash from a prior run's result.
   * Pass this to restore the step ledger on cold start so completed steps
   * are skipped on resume. This is the durable resume pointer.
   */
  storageRootHint?: string;
}

export interface RunDurableAgentResult {
  jobId: string;
  completedSteps: string[];
  /**
   * The 0G Storage root of the final step-ledger blob. Pass this back as
   * `storageRootHint` in a future call to resume from this exact ledger.
   * This is the durable resume pointer — persist it if you need cross-restart
   * resumability.
   */
  storageRoot: string | undefined;
}

// ---------------------------------------------------------------------------
// Storage singleton (module-scoped)
// ---------------------------------------------------------------------------

let _storage: Storage | undefined;

function getStorage(): Storage {
  if (!_storage) {
    const privateKey = process.env.OG_PRIVATE_KEY;
    const rpcUrl = process.env.OG_RPC_URL;
    if (!privateKey || !rpcUrl) {
      throw new Error(
        "Missing OG_PRIVATE_KEY or OG_RPC_URL. " +
          "These are required for durable step-ledger persistence in 0G Storage."
      );
    }
    const config: StorageConfig = { privateKey, rpcUrl };
    _storage = new Storage(config);
  }
  return _storage;
}

// ---------------------------------------------------------------------------
// Root registry: ledgerKey → latest 0G Storage root
//
// DURABLE CONTENT: step-ledger JSON lives in 0G Storage. This in-process Map
// is seeded from storageRootHint (if provided) and updated on every markStepDone.
// ---------------------------------------------------------------------------

const rootRegistry = new Map<string, string>();

// ---------------------------------------------------------------------------
// 0G-Storage-backed AgentJobsBackend
// ---------------------------------------------------------------------------

function makeStorageBackend(jobId: string, rootHint?: string): AgentJobsBackend {
  const ns = process.env.OG_STORAGE_NAMESPACE ?? "durable-agent";
  const ledgerKey = `${ns}/${jobId}/steps`;

  // Seed the root registry from hint if provided (enables cold-start resume)
  if (rootHint) rootRegistry.set(ledgerKey, rootHint);

  return {
    getLedgerKey(): string { return ledgerKey; },

    async getCompletedSteps(): Promise<Set<string>> {
      const root = rootRegistry.get(ledgerKey);
      if (!root) return new Set<string>();
      try {
        const bytes = await getStorage().download(root);
        if (!bytes) return new Set<string>();
        const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
        if (Array.isArray(parsed)) return new Set<string>(parsed as string[]);
        return new Set<string>();
      } catch {
        return new Set<string>();
      }
    },

    async markStepDone(key: string): Promise<void> {
      const current = await this.getCompletedSteps();
      current.add(key);
      const encoded = new TextEncoder().encode(JSON.stringify(Array.from(current)));
      const result = await getStorage().upload(encoded);
      rootRegistry.set(ledgerKey, result.root);
    },
  } as AgentJobsBackend & { getLedgerKey(): string };
}

// ---------------------------------------------------------------------------
// Agent definition
// ---------------------------------------------------------------------------

const agentDef = defineAgent({
  name: "durable-agent",
  steps: defaultPipeline,
});

// ---------------------------------------------------------------------------
// runDurableAgent
//
// Enqueues the agent run as a real 0gkit-jobs job and waits for it to complete.
// The job handler runs the agent steps via createRunner, replaying the
// 0G-Storage-persisted step ledger so already-completed steps are skipped.
// ---------------------------------------------------------------------------

export async function runDurableAgent(
  options: RunDurableAgentOptions = {}
): Promise<RunDurableAgentResult> {
  const { input = {}, storageRootHint } = options;
  const jobId =
    options.jobId ?? `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const ns = process.env.OG_STORAGE_NAMESPACE ?? "durable-agent";
  const ledgerKey = `${ns}/${jobId}/steps`;

  // Seed root hint before the job runs so the handler can resume
  if (storageRootHint) rootRegistry.set(ledgerKey, storageRootHint);

  const privateKey = process.env.OG_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("Missing OG_PRIVATE_KEY — required to build the 0gkit-jobs signer.");
  }
  const signer = await fromPrivateKey(privateKey);

  // MemoryBackend: in-process job queue (default, suitable for storage-app scripts).
  // For cross-process durability, swap in SqliteBackend:
  //   import { SqliteBackend } from "@foundryprotocol/0gkit-jobs/backends/sqlite";
  //   const backend = new SqliteBackend({ path: "./jobs.db" });
  const backend = new MemoryBackend();

  const agentJobDef = jobs.define({
    name: "durable-agent-run",
    input: z.object({
      jobId: z.string(),
      input: z.record(z.unknown()),
    }),
    output: z.object({ completedSteps: z.array(z.string()) }),
    handler: async ({ input: payload }) => {
      const { jobId: jid, input: jInput } = payload;

      // Step ledger backed by 0G Storage — durable, survives restarts
      const agentBackend = makeStorageBackend(jid, storageRootHint);

      // No-op tracer: storage-app base does not ship @opentelemetry/api.
      // Documented intentionally — see file header.
      const stepTracer = makeNoopTracer();

      const runner = createRunner({
        agent: agentDef,
        backend: agentBackend,
        tracer: stepTracer,
      });

      await runner.run(jInput);

      const completed = Array.from(await agentBackend.getCompletedSteps());
      return { completedSteps: completed };
    },
    maxAttempts: 3,
  });

  const jobRunner = new JobRunner({ backend, signer });
  jobRunner.register(agentJobDef);
  await jobRunner.start();

  const enqueuedId = await jobRunner.enqueue(agentJobDef, { jobId, input });
  const record = await jobRunner.waitFor(enqueuedId, { timeoutMs: 60_000 });
  await jobRunner.stop();

  if (record.state === "failed") {
    throw new Error(`Agent run failed: ${record.error ?? "unknown error"}`);
  }

  const completedSteps = (record.result as { completedSteps: string[] } | undefined)
    ?.completedSteps ?? [];

  return {
    jobId,
    completedSteps,
    // Return the final Storage root so the caller can persist it for cold-start resume
    storageRoot: rootRegistry.get(ledgerKey),
  };
}
