# ai-agent — multi-step agent on 0G Compute (TEE-attested per step)

A Node script that runs a **LangChain-style ReAct agent** where every inference
step is paid through 0G Compute and accompanied by a TEE-attestation gate — so
you can prove off-the-record that each chain-of-thought step ran inside a
genuine secure enclave.

Stack: `@foundryprotocol/0gkit-compute` · `@foundryprotocol/0gkit-attestation` ·
`@foundryprotocol/0gkit-wallet`.

## Architecture

```
runAgent(prompt) ──┐
                   ▼
            ┌──────────────┐
            │ 1. compute.  │
       ┌────│   inference  │────► InferenceResult { output, receipt }
       │    └──────────────┘
       │           │
       │           ▼
       │    ┌──────────────┐
       │    │ 2. verifyStep│── false ─► ABORT
       │    │ (attestation)│
       │    └──────────────┘
       │           │
       │           ▼
       │    ┌──────────────┐
       │    │ 3. parse     │
       │    │  decision    │
       │    └──────────────┘
       │      │         │
       │   tool       done
       │      │         │
       │      ▼         ▼
       │  invoke    return final
       │     │
       └─────┘
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
- **`src/agent.ts`** — `runAgent(prompt, deps)`. Loops up to `maxSteps`:
  inference → verify step → parse decision → tool-or-done. Pure with respect
  to `deps` (compute client, tool registry, attestation verifier), so it
  tests fully offline.
- **`src/index.ts`** — wires the real `Compute` client, registers two demo
  tools, runs `runAgent`. **The `verifyStep` here is a stub** — see below.

## Wiring real attestation

In production, replace the stub `verifyStep` in `src/index.ts` with a real
attestation gate. Sketch:

```ts
import { verifyEnvelope } from "@foundryprotocol/0gkit-attestation";

const PROVIDER_SIGNER = "0x…" as const; // your trusted enclave's signing addr

const verifyStep = async (_step: number, _res: InferenceResult) => {
  // Fetch the attestation envelope your provider signed for the just-issued
  // inference. The shape and endpoint are provider-specific — this is where
  // your enclave's attestation source comes in.
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

## SP10 (`@foundryprotocol/0gkit-jobs`) hand-off

The agent loop is intentionally shaped to map onto a durable job runner
one-to-one once SP10 ships:

```ts
// today
const res = await compute.inference({ messages });

// SP10
const handle = await jobs.enqueue("agent-step", { messages });
const res = await handle.await();
```

Verification + decision parsing + tool invocation stay put. The README will
be updated when SP10 lands.

## Run the tests

```bash
pnpm test
```

Eight tests cover the agent's six branches (`done`, `tool`, abort on max
steps, abort on bad attestation, abort on unknown tool, non-JSON fallback)
plus the `ToolRegistry` surface. ≥ 80% lines / ≥ 70% branches.

## Next steps

- Replace the toy `add` tool with something real — a 0G Storage retrieval,
  a contract read, an HTTP call to your own API.
- Wire `verifyEnvelope` against your provider's actual attestation source.
- Persist every step's transcript to 0G Storage to leave a forensic trail
  of the agent's reasoning.
