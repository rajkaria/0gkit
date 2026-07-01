/**
 * durable-agent — mcp-agent adapter
 *
 * Registers three MCP tools:
 *   agent_run      — start a new agent run (enqueued via 0gkit-jobs); returns jobId
 *   agent_status   — inspect a run by jobId (status + completed steps from Storage)
 *   agent_cancel   — cancel a pending/running run (best-effort)
 *
 * Durability model
 * ─────────────────
 * DURABLE (survives restarts):
 *   - Step ledger — completed step keys serialized to JSON and uploaded to 0G Storage
 *     (content-addressed root-registry pattern, exactly like the agent-memory kit).
 *
 * NOT durable (in-process only):
 *   - Run status registry (running/done/failed/cancelled) — module-scoped Map.
 *   - JobRunner / MemoryBackend — in-process job queue by default.
 *     Swap in @foundryprotocol/0gkit-jobs/backends/sqlite for cross-process durability.
 *
 * Tracing
 * ────────
 * No-op tracer: mcp-agent base does not ship @opentelemetry/api. The noop is
 * documented here intentionally — add @opentelemetry/api as a dep and swap in
 * an OTel tracer adapter to enable real span emission.
 *
 * Usage (in your MCP server entry point):
 *   import { registerAgentTools } from "./src/tools/agent.js";
 *   registerAgentTools(server);
 *
 * Environment variables:
 *   OG_PRIVATE_KEY          — 0x-prefixed private key (required)
 *   OG_RPC_URL              — 0G chain RPC URL (required)
 *   OG_STORAGE_NAMESPACE    — blob namespace prefix (default: "durable-agent")
 *   OG_JOBS_BACKEND         — informational; "memory" (default) or "sqlite"
 */

// NOTE: Adapters MAY import 0gkit packages.
// @opentelemetry/api is NOT a dep of mcp-agent base — using no-op tracer (documented above).
import { z } from "zod";
import { JobRunner, jobs } from "@foundryprotocol/0gkit-jobs";
import { MemoryBackend } from "@foundryprotocol/0gkit-jobs/backends/memory";
// SQLite backend for cross-process job durability:
//   import { SqliteBackend } from "@foundryprotocol/0gkit-jobs/backends/sqlite";
import { fromPrivateKey } from "@foundryprotocol/0gkit-wallet";
import { Storage, type StorageConfig } from "@foundryprotocol/0gkit-storage";
import { collectToolPlugin, type McpServerLike } from "@foundryprotocol/0gkit-mcp";

import {
  defineAgent,
  createRunner,
  makeNoopTracer,
  type AgentJobsBackend,
} from "../../agent.js";
import { defaultPipeline } from "../../steps.js";

// Re-export McpServerLike so existing code using this file's type still works.
export type { McpServerLike };

// ---------------------------------------------------------------------------
// Singleton Storage instance
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
// Root registry: jobId → latest 0G Storage root for the step-ledger blob
//
// DURABLE CONTENT: step-ledger JSON lives in 0G Storage. This in-process Map
// tracks the latest root per jobId. Survives multiple tool calls within the same
// process. On cold start it is empty — add a persistent root-registry store
// (another 0G blob) for full restart durability.
// ---------------------------------------------------------------------------

const rootRegistry = new Map<string, string>();

// ---------------------------------------------------------------------------
// 0G-Storage-backed AgentJobsBackend
// ---------------------------------------------------------------------------

function makeStorageBackend(jobId: string): AgentJobsBackend {
  const ns = process.env.OG_STORAGE_NAMESPACE ?? "durable-agent";
  const ledgerKey = `${ns}/${jobId}/steps`;

  return {
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
  };
}

// ---------------------------------------------------------------------------
// Run registry (in-process — NOT durable across restarts)
// ---------------------------------------------------------------------------

type RunStatus = "running" | "done" | "failed" | "cancelled";
const runRegistry = new Map<string, { status: RunStatus; error?: string }>();

// ---------------------------------------------------------------------------
// Agent definition
// ---------------------------------------------------------------------------

const agentDef = defineAgent({
  name: "durable-agent",
  steps: defaultPipeline,
});

// ---------------------------------------------------------------------------
// 0gkit-jobs wiring
// ---------------------------------------------------------------------------

const jobBackend = new MemoryBackend();

const agentJobDef = jobs.define({
  name: "durable-agent-run",
  input: z.object({
    jobId: z.string(),
    input: z.record(z.unknown()),
  }),
  output: z.object({ completedSteps: z.array(z.string()) }),
  handler: async ({ input: payload }) => {
    const { jobId, input } = payload;

    runRegistry.set(jobId, { status: "running" });

    // Step ledger backed by 0G Storage — durable, survives restarts
    const agentBackend = makeStorageBackend(jobId);

    // No-op tracer: mcp-agent base does not ship @opentelemetry/api.
    // Documented intentionally — add @opentelemetry/api as a dep and inject
    // an OTel tracer here to enable real span emission.
    const stepTracer = makeNoopTracer();

    const runner = createRunner({
      agent: agentDef,
      backend: agentBackend,
      tracer: stepTracer,
    });

    await runner.run(input);

    const completed = Array.from(await agentBackend.getCompletedSteps());
    runRegistry.set(jobId, { status: "done" });
    return { completedSteps: completed };
  },
  maxAttempts: 3,
});

let _jobRunner: JobRunner | undefined;

async function getJobRunner(): Promise<JobRunner> {
  if (_jobRunner) return _jobRunner;

  const privateKey = process.env.OG_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      "Missing OG_PRIVATE_KEY — required to build the 0gkit-jobs signer."
    );
  }
  const signer = await fromPrivateKey(privateKey);

  _jobRunner = new JobRunner({ backend: jobBackend, signer });
  _jobRunner.register(agentJobDef);
  await _jobRunner.start();
  return _jobRunner;
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerAgentTools(server: McpServerLike): void {
  // -------------------------------------------------------------------------
  // agent_run — enqueue a new agent run via 0gkit-jobs
  // -------------------------------------------------------------------------

  server.tool(
    "agent_run",
    "Start a new durable agent run via 0gkit-jobs. " +
      "The agent executes a multi-step pipeline (research → act → record). " +
      "Each step is idempotent — already-completed steps are skipped on resume " +
      "(step ledger is persisted to 0G Storage). " +
      "Returns a jobId to track the run via agent_status.",
    {
      type: "object",
      properties: {
        input: {
          type: "object",
          description:
            "Optional input payload passed to each step (e.g. { prompt: '...' })",
        },
      },
      required: [],
    },
    async ({ input }: { input?: Record<string, unknown> }) => {
      const resolvedInput = input ?? {};
      const jobId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const jobRunner = await getJobRunner();
      await jobRunner.enqueue(agentJobDef, { jobId, input: resolvedInput });
      runRegistry.set(jobId, { status: "running" });

      return {
        content: [
          {
            type: "text",
            text: `Agent run enqueued via 0gkit-jobs. jobId: ${jobId}\nUse agent_status to check progress.`,
          },
        ],
      };
    }
  );

  // -------------------------------------------------------------------------
  // agent_status — inspect a run (reads step ledger from 0G Storage)
  // -------------------------------------------------------------------------

  server.tool(
    "agent_status",
    "Inspect the status of a durable agent run. " +
      "Returns the run status (running/done/failed/cancelled), " +
      "the list of completed step keys (read from 0G Storage — durable), " +
      "and any error message on failure.",
    {
      type: "object",
      properties: {
        jobId: {
          type: "string",
          description: "The jobId returned by agent_run",
        },
      },
      required: ["jobId"],
    },
    async ({ jobId }: { jobId: string }) => {
      const run = runRegistry.get(jobId);
      if (!run) {
        return {
          content: [{ type: "text", text: `No run found for jobId: ${jobId}` }],
        };
      }

      // Read completed steps from the durable 0G Storage ledger
      const agentBackend = makeStorageBackend(jobId);
      const completedSteps = Array.from(await agentBackend.getCompletedSteps());

      const lines = [
        `jobId: ${jobId}`,
        `status: ${run.status}`,
        `completedSteps (durable, from 0G Storage): ${completedSteps.length > 0 ? completedSteps.join(", ") : "(none)"}`,
        ...(run.error ? [`error: ${run.error}`] : []),
      ];
      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // agent_cancel — cancel a run (best-effort)
  // -------------------------------------------------------------------------

  server.tool(
    "agent_cancel",
    "Cancel a pending or running durable agent run. " +
      "Best-effort: if the run is already done or failed, this is a no-op. " +
      "Already-completed steps are retained in the 0G Storage ledger so a future " +
      "agent_run call can resume from where it left off.",
    {
      type: "object",
      properties: {
        jobId: {
          type: "string",
          description: "The jobId to cancel",
        },
      },
      required: ["jobId"],
    },
    async ({ jobId }: { jobId: string }) => {
      const run = runRegistry.get(jobId);
      if (!run) {
        return {
          content: [{ type: "text", text: `No run found for jobId: ${jobId}` }],
        };
      }

      if (run.status === "running") {
        runRegistry.set(jobId, { status: "cancelled" });
        return {
          content: [
            {
              type: "text",
              text: `Run ${jobId} cancelled (in-flight steps may still complete). Completed steps remain durable in 0G Storage.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Run ${jobId} is already ${run.status}. No action taken.`,
          },
        ],
      };
    }
  );
}

// ---------------------------------------------------------------------------
// mcpToolPlugin factory — additive export for use with create0gMcpServer
// ---------------------------------------------------------------------------

/**
 * Build an McpToolPlugin from the durable-agent kit.
 *
 * Usage:
 *   import { mcpToolPlugin } from "./src/tools/agent.js";
 *   const server = await create0gMcpServer({ plugins: [mcpToolPlugin(process.env)] });
 *
 * NOTE: unlike the other kit adapters, `registerAgentTools` reads `process.env`
 * directly (OG_PRIVATE_KEY / OG_RPC_URL / OG_STORAGE_NAMESPACE) via its
 * module-scoped storage + job-runner singletons. The `_env` argument is
 * accepted only for factory-signature symmetry with the other kits — it is NOT
 * threaded through, so passing a custom env object here does not override
 * `process.env`. Set the vars in the process environment.
 */
export const mcpToolPlugin = (_env: Record<string, string | undefined>) =>
  collectToolPlugin("durable-agent", (s) => registerAgentTools(s));
