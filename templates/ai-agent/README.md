# ai-agent — multi-step agent on 0G Compute (TEE-attested per step, durable jobs)

A Node script that runs a **LangChain-style ReAct agent** where every inference
step is paid through 0G Compute, accompanied by a TEE-attestation gate, and
orchestrated as a durable job via `@foundryprotocol/0gkit-jobs`. The loop
survives a worker crash if you point the runner at a durable backend (sqlite
or redis).

Stack: `@foundryprotocol/0gkit-compute` · `@foundryprotocol/0gkit-attestation`
· `@foundryprotocol/0gkit-wallet` · `@foundryprotocol/0gkit-jobs`.

## Architecture

```
runAgent(prompt) ──┐
                   ▼
            ┌───────────────────┐
            │ runner.enqueue    │  (each ReAct iteration becomes one durable
            │   "agent.step"    │   job, persisted in the configured backend)
            └─────────┬─────────┘
                      ▼
            ┌───────────────────┐
            │ handler:          │
            │  1. compute.      │
       ┌────│     inference     │────► InferenceResult { output, receipt }
       │    │  2. verifyStep    │
       │    │     (attestation) │── false ─► verified: false ─► ABORT
       │    └─────────┬─────────┘
       │              ▼
       │    ┌───────────────────┐
       │    │ runner.waitFor    │
       │    │ parse decision    │
       │    └─────────┬─────────┘
       │       │         │
       │    tool       done
       │       │         │
       │       ▼         ▼
       │   invoke    return final
       │       │
       └───────┘
```

## Quickstart

```bash
cp .env.example .env
# PRIVATE_KEY needs a 0G Compute prepaid balance.

pnpm install
pnpm dev "What is 17 + 25? Use the add tool."
```

Sample output:

```
step 1: action=tool add
step 2: action=done

Agent result: final
  Answer: 42
  Steps : 2
    [1] tx=0x… tool=add
    [2] tx=0x…
```

## Walk through the code

- **`src/tools.ts`** — `ToolRegistry`. Register named handlers; the agent
  invokes them when the model emits `{"action":"tool","name":"…"}`.
- **`src/agent.ts`** — exports `buildStepJob({ compute, verifyStep })` (the
  per-iteration job definition) and `runAgent(prompt, deps)` (the
  orchestration loop). The loop is pure w.r.t. the job runner — it tests
  fully offline against `MemoryBackend`.
- **`src/index.ts`** — wires the real `Compute` client, builds the StepJob,
  registers it on a `JobRunner` with `MemoryBackend`, runs `runAgent`,
  drains the runner on exit. **The `verifyStep` here is a stub** — see below.

## Durable backends

`src/index.ts` defaults to `MemoryBackend` — zero infra, perfect for a
tutorial. For production, swap one line:

```ts
// dev / demos (current default)
import { MemoryBackend } from "@foundryprotocol/0gkit-jobs/backends/memory";
const backend = new MemoryBackend();

// single-node prod (file-backed, survives process restarts)
import { SqliteBackend } from "@foundryprotocol/0gkit-jobs/backends/sqlite";
const backend = new SqliteBackend({ path: "./.jobs.db" });

// multi-node prod (requires `pnpm add ioredis`)
import { RedisBackend } from "@foundryprotocol/0gkit-jobs/backends/redis";
const backend = new RedisBackend({ url: process.env.REDIS_URL! });
```

All three implement the same `JobBackend` interface — the rest of the
template is unchanged.

## Wiring real attestation

In production, replace the stub `verifyStep` in `src/index.ts` with a real
attestation gate. Sketch:

```ts
import { verifyEnvelope } from "@foundryprotocol/0gkit-attestation";

const PROVIDER_SIGNER = "0x…" as const; // your trusted enclave's signing addr

const verifyStep = async (_step: number, _res: InferenceResult) => {
  const envelope = await fetchProviderAttestationForLatestStep();
  const result = await verifyEnvelope(envelope, PROVIDER_SIGNER);
  return result.ok;
};
```

The `InferenceResult` shape today is `{ output, receipt, raw }` — no
attestation field on the response itself, by design. The attestation is a
separate envelope you fetch out-of-band so the same template works against
providers that hand it back over a sidecar API, a websocket, or an on-chain
event.

## Webhook delivery

If you want your app notified when an agent run finishes (or each step
completes), pass a `webhook` config to the JobRunner:

```ts
const runner = new JobRunner({
  backend,
  signer,
  webhook: {
    url: process.env.AGENT_WEBHOOK_URL!,
    secret: process.env.AGENT_WEBHOOK_SECRET!,
  },
});
```

Receivers verify the signature with `jobs.verifyWebhook({ body, signature,
secret })` — see the
[`@foundryprotocol/0gkit-jobs` README](https://github.com/rajkaria/0gkit/tree/main/packages/0gkit-jobs)
for a complete server-side example.

## Run the tests

```bash
pnpm test
```

Seven tests cover the agent's six branches (`done`, `tool`, abort on max
steps, abort on bad attestation, abort on unknown tool, non-JSON fallback)
plus an end-to-end retry-exhaustion path that exercises the JobRunner +
StepJob integration. ≥ 80% lines / ≥ 70% branches.

## Next steps

- Swap `MemoryBackend` for `SqliteBackend` so a worker crash mid-loop
  resumes on restart.
- Replace the toy `add` tool with something real — a 0G Storage retrieval,
  a contract read, an HTTP call to your own API.
- Wire `verifyEnvelope` against your provider's actual attestation source.
- Persist every step's transcript to 0G Storage to leave a forensic trail
  of the agent's reasoning.
