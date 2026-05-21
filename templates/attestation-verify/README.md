# attestation-verify

A minimal Node + TypeScript starter that **parses and verifies a 0G TEE
attestation envelope** with
[`@foundryprotocol/0gkit-attestation`](https://www.npmjs.com/package/@foundryprotocol/0gkit-attestation).

100% local crypto — **no network, no keys, no funds**. The demo signs a
sample envelope with a well-known test key, recovers the signer, verifies
digest + signer, and shows that tampering flips the result to `ok: false`.

## Prerequisites

- Node.js **>= 20.10**

## Clone

```bash
npx degit rajkaria/0gkit/templates/attestation-verify attestation-verify
cd attestation-verify
npm install
```

## Setup

No setup required. (`.env.example` is included for consistency and an
optional `DEMO_PRIVATE_KEY` override only.)

## Run

```bash
npm start
```

## Expected output

```
attestation foundry/eval-result/v1
  forge        0x1111111111111111111111111111111111111111
  coordinator  0x70997970C51812dc3A010C7d01b50e0d17dc79C8
  scores       [0.91, 0.87, 0.95]  baseline 0.8
  timestamp    2026-01-01T00:00:00.000Z
  teeAttest    0xdeadbeef
  daRef        (none)
  digest       0x…
  signature    0x…

Parsed envelope kind: foundry/eval-result/v1
Recovered signer    : 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
Expected coordinator: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8

verify(valid)   ok=true digest=true signer=true
verify(tampered) ok=false digest=false signer=false

Attestation verification works as expected.
```

## How it works

`signEnvelope(envelope, key)` → `{ envelope, digest, signature }`;
`verifyEnvelope(signed, expectedSigner)` returns
`{ ok, checks: { digest, signer }, signer }` and **never throws** for a bad
signature. Signatures are EIP-191 personal-sign over the canonical-JSON
keccak digest, so they verify identically on-chain. See
[`src/index.ts`](./src/index.ts).

## Docs

- 0gkit: <https://github.com/rajkaria/0gkit>
- 0G docs: <https://docs.0g.ai>
