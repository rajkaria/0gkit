# tee-attested-api — Hono API with TEE attestation on every response

A minimal Hono API where **every response** carries a TEE attestation in the
`X-0G-Attestation` header. Clients can verify the attestation cryptographically
to prove the response came from genuine enclave hardware.

Stack: `hono@^4` · `@foundryprotocol/0gkit-compute` ·
`@foundryprotocol/0gkit-attestation` · `@foundryprotocol/0gkit-wallet`.

## Endpoints

| Method | Path     | Returns                                       |
| ------ | -------- | --------------------------------------------- |
| GET    | `/health` | `{ ok: true }`                                |
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
  fallback if the provider throws) and `withAccessLog` (one log line per
  request, format: `METHOD PATH STATUS DURms`).
- **`src/app.ts`** — `buildApp(deps)` wires the middlewares onto a Hono app
  and registers `/health` and `/chat`. Pure with respect to `deps` so it
  tests offline.
- **`src/index.ts`** — production entry. Wires the real `Compute` client and
  the attestation provider. **Today the attestation source is a fixture** —
  see "Wiring real attestation" below.

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

The shape of `cachedAttestation` must match
`SignedEnvelope` from `@foundryprotocol/0gkit-attestation` for the client's
`verifyEnvelope` call to round-trip.

## SP11 (`@foundryprotocol/0gkit-observability`) hand-off

Today the access log uses `console.log`. When SP11 ships, the swap is a
single line in `src/index.ts`:

```ts
// today
log: (m) => console.log(m),

// SP11
log: structuredLogger({ service: "tee-attested-api" }),
```

…and the attestation header gets a sibling `traceparent` header for
distributed tracing.

## Run the tests

```bash
pnpm test
```

Six tests cover all four endpoints + edge cases (missing prompt, invalid
JSON, provider failure) at ≥ 80% lines.
