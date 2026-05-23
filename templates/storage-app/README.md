# storage-app — upload + retrieve with dedup and dry-run

The fastest path from a file on disk to a content-addressed blob on **0G Storage**.

Built on `@foundryprotocol/0gkit-storage`. Demos:

- **SP3 wallet** (`fromEnv` signer)
- **SP7 estimate + dry-run** (predict the cost + Merkle root before broadcasting)
- **Dedup** (skip the funding tx if the root already exists upstream)

## What it does

1. **Dry-run preflight** — `storage.upload(bytes, { dryRun: true })` returns the predicted Merkle root _and_ the gas/fee estimate, **without** broadcasting.
2. **Dedup check** — if `storage.exists(predictedRoot)` is true, the funding tx is skipped entirely.
3. **Live upload** — sends the funding tx, returns receipt + Merkle root.
4. **Round-trip verify** — downloads by root and asserts byte-for-byte equality.

## Quickstart

```bash
cp .env.example .env
# Fill in PRIVATE_KEY (galileo testnet faucet: https://faucet.0g.ai)

pnpm install
pnpm dev
```

Sample output (first run):

```
Read 1342 bytes from /…/src/index.ts

Dry-run estimate:
  type: storage
  gas:  80000
  fee:  1 gwei
  predicted root: 0xabc…123

Uploading…
  Merkle root : 0xabc…123
  tx hash     : 0xdef…456
  latency     : 1421ms
Downloading back…
  Got 1342 bytes
Round-trip OK.
```

On a re-run (same file, same root):

```
Read 1342 bytes from /…/src/index.ts

Dry-run estimate:
  type: storage
  gas:  80000
  fee:  1 gwei
  predicted root: 0xabc…123

Dedup: 0xabc…123 already on 0G Storage — skipping broadcast.
```

## Walk through the code

- **`src/index.ts`** — thin entry. Loads a signer from `PRIVATE_KEY`, wires the live `Storage` client into `runStorageFlow`.
- **`src/storage-flow.ts`** — the testable surface. Pure with respect to `deps`. This is what the tests exercise.
- **`src/estimate.ts`** — standalone cost estimator: `pnpm estimate path/to/file` prints the predicted gas + fee without doing anything else.

The dry-run uses [`Storage.upload(bytes, { dryRun: true })`](https://docs.0gkit.com/packages/storage#dryrun) and the live upload omits the flag. Both calls return the same `result.root` shape, so the dedup check is a simple `storage.exists(predictedRoot)`.

## Test it offline

```bash
pnpm test
```

The tests use an in-process fake `Storage` (sha256 keys, in-memory blob store) — no network, no signer needed. All branches (new upload, dedup hit, byte mismatch) are covered at ≥ 80% lines / ≥ 70% branches.

## Where to go next

- Swap `fromEnv` for a hardware-backed signer via [`fromKMS`](https://docs.0gkit.com/packages/wallet#fromkms).
- Wire the flow into your own data pipeline — `runStorageFlow` accepts any `bytes: Uint8Array` and `label: string`.
- When [`@foundryprotocol/0gkit-jobs`](https://docs.0gkit.com/packages/jobs) (SP10) ships, long uploads will be moved off the main loop into a durable queue.

## Deploy on Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Frajkaria%2F0gkit%2Ftree%2Fmain%2Ftemplates%2Fstorage-app&project-name=0gkit-storage-app&env=NETWORK%2CPRIVATE_KEY&envDescription=See%20docs.0gkit.com%20env%20vars&envLink=https%3A%2F%2Fdocs.0gkit.com%2Fgetting-started%2Fenv-vars)

Vercel will fork the template into a new repository, prompt for the listed
env vars, and deploy in under 60 seconds on Fluid Compute.
