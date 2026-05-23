# tee-attested-api — Hono API with TEE attestation on every response

A minimal Hono API where **every response** carries a TEE attestation in the
`X-0G-Attestation` header. Clients can verify the attestation cryptographically
to prove the response came from genuine enclave hardware.

Stack: `hono@^4` · `@foundryprotocol/0gkit-compute` ·
`@foundryprotocol/0gkit-attestation` · `@foundryprotocol/0gkit-wallet` ·
`@foundryprotocol/0gkit-observability`.

## Endpoints

| Method | Path      | Returns                                        |
| ------ | --------- | ---------------------------------------------- |
| GET    | `/health` | `{ ok: true }`                                 |
| POST   | `/chat`   | `{ reply, txHash }` — runs prompt thru Compute |

Every response includes:

```
X-0G-Attestation: {"v":1,"envelope":{…},"digest":"…","signature":"…","signer":"…"}
```

(If the attestation provider throws, the server attaches
`X-0G-Attestation-Error` instead so clients can detect the failure mode.)

## Quickstart

```bash
cp .env.example .env
# PRIVATE_KEY pays for /chat's compute call.

pnpm install
pnpm dev
# → tee-attested-api listening on http://localhost:8787

curl -i -X POST http://localhost:8787/chat \
  -H 'content-type: application/json' \
  -d '{"prompt":"hello"}'
```

## Observability (OTel out of the box)

Every request emits an OTel span (`{METHOD} {PATH}` with `http.method`,
`http.route`, `http.status_code`, `http.duration_ms` attributes). Every 0G
primitive call inside the request — for example `Compute.inference()` in
`/chat` — also emits a `0gkit.*` span via
[`instrument0g()`](https://docs.0gkit.com/packages/0gkit-observability).

Out of the box the runtime is silent (no `console.log` access lines — pull a
real exporter for production). To ship spans, set
`OTEL_EXPORTER_OTLP_ENDPOINT` (and optionally `OTEL_EXPORTER_OTLP_HEADERS`):

```bash
# Honeycomb
export OTEL_EXPORTER_OTLP_ENDPOINT="https://api.honeycomb.io/v1/traces"
export OTEL_EXPORTER_OTLP_HEADERS="x-honeycomb-team=$HONEYCOMB_API_KEY"

# Vercel OTel
export OTEL_EXPORTER_OTLP_ENDPOINT="https://api.vercel.com/v1/otel/v1/traces"
export OTEL_EXPORTER_OTLP_HEADERS="authorization=Bearer $VERCEL_TOKEN"

# Datadog (via a local agent on :4318)
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318/v1/traces"
```

`OTEL_EXPORTER_OTLP_HEADERS` is a comma-separated `key=value,key=value` list,
parsed in `src/index.ts`. If you already configure an OTel SDK yourself in
some other way, swap `instrument0g({ exporter: { kind: 'otlp', ... } })` for
`instrument0g({ mode: 'attach' })` and we'll skip SDK setup but still patch
the primitives.

See [`@foundryprotocol/0gkit-observability` docs](https://docs.0gkit.com/packages/0gkit-observability)
for the full span-attribute reference.

## Verifying the header on the client side

```ts
import { verifyEnvelope } from "@foundryprotocol/0gkit-attestation";

const res = await fetch("http://localhost:8787/health");
const att = JSON.parse(res.headers.get("X-0G-Attestation")!);
const result = await verifyEnvelope(att, "0xYourTrustedSigner");
if (!result.ok) throw new Error("attestation failed");
```

## Walk through the code

- **`src/middleware.ts`** — two Hono middlewares: `withAttestation` (attaches
  `X-0G-Attestation` to every response, with a graceful `X-0G-Attestation-Error`
  fallback if the provider throws) and `withAccessLog` (wraps every request
  in an OTel span and records `http.*` attributes — no more `console.log`).
- **`src/app.ts`** — `buildApp(deps)` wires the middlewares onto a Hono app
  and registers `/health` and `/chat`. Pure with respect to `deps` so it
  tests offline. Tests pass an in-memory exporter via the optional `tracer`
  dep to assert spans without a real OTel SDK.
- **`src/index.ts`** — production entry. Calls `instrument0g({...})` first,
  wires the real `Compute` client, and starts Hono. **Today the attestation
  source is a fixture** — see "Wiring real attestation" below.

## Wiring real attestation

The template wires `fixtureAttestation` from `@foundryprotocol/0gkit-testing`
as the attestation source so the server starts and round-trips immediately.
Replace `getAttestation` in `src/index.ts` with your real provider feed
before any deployment:

```ts
// today (stub)
const { fixtureAttestation } = await import("@foundryprotocol/0gkit-testing/fixtures");
let cachedAttestation = await fixtureAttestation();

// production
import { fetchProviderAttestation } from "./my-attestation-source.js";
let cachedAttestation = await fetchProviderAttestation();
setInterval(async () => {
  cachedAttestation = await fetchProviderAttestation();
}, 60_000);
```

The shape of `cachedAttestation` must match `SignedEnvelope` from
`@foundryprotocol/0gkit-attestation` for the client's `verifyEnvelope` call
to round-trip.

## Run the tests

```bash
pnpm test
```

Eight tests cover all four endpoints + edge cases (missing prompt, invalid
JSON, provider failure) and assert OTel spans via an in-memory exporter — at
≥ 80% lines / 70% branches.

## Deploy on Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Frajkaria%2F0gkit%2Ftree%2Fmain%2Ftemplates%2Ftee-attested-api&project-name=0gkit-tee-attested-api&env=NETWORK%2CPRIVATE_KEY%2COTEL_EXPORTER_OTLP_ENDPOINT&envDescription=See%20docs.0gkit.com%20env%20vars&envLink=https%3A%2F%2Fdocs.0gkit.com%2Fgetting-started%2Fenv-vars)

Vercel will fork the template into a new repository, prompt for the listed
env vars, and deploy in under 60 seconds on Fluid Compute.
