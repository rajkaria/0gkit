# react-app

A minimal **Next.js 16 (App Router) + React 19** starter using the hooks
from
[`@foundryprotocol/0gkit-react`](https://www.npmjs.com/package/@foundryprotocol/0gkit-react):

- **Upload panel** — pick a file and push it to 0G Storage with `useUpload`.
- **Attestation panel** — verify a signed TEE attestation with
  `useAttestation` (pure crypto, no network or keys; tampering flips it to
  `ok: false`).

Every hook exposes the same shape: `{ data, error, loading, reset }` plus a
named runner that both updates reactive state and resolves/rejects.

## Prerequisites

- Node.js **>= 20.10**

## Clone

```bash
npx degit rajkaria/0gkit/templates/react-app react-app
cd react-app
npm install
```

## Setup

```bash
cp .env.example .env
```

| Var                            | Purpose                                                    |
| ------------------------------ | ---------------------------------------------------------- |
| `NEXT_PUBLIC_ZEROG_NETWORK`    | `galileo` (testnet, default) or `aristotle`                |
| `NEXT_PUBLIC_DEMO_PRIVATE_KEY` | Optional throwaway testnet key to enable the upload button |

The attestation panel needs **no configuration** — it works out of the box.

> Security: `NEXT_PUBLIC_*` values ship to the browser. Never put a real
> upload key here. For production, proxy uploads through a server route or
> the 0gkit CLI.

## Run

```bash
npm run dev      # http://localhost:3000
# or
npm run build && npm start
```

## Expected behavior

- **Verify valid** → green box, `ok: true`, recovered signer matches the
  coordinator.
- **Verify tampered** → red box, `ok: false`, `digest: false`.
- **Upload** (with a key set) → green box with the Merkle root + tx hash.

## How it works

`useUpload({ network, privateKey }).upload(bytes)` → `{ root, tx }`;
`useAttestation().verify(signed, expectedSigner)` →
`{ ok, checks, signer }`. See
[`app/UploadPanel.tsx`](./app/UploadPanel.tsx) and
[`app/AttestationPanel.tsx`](./app/AttestationPanel.tsx).

## Docs

- 0gkit: <https://github.com/rajkaria/0gkit>
- Next.js: <https://nextjs.org/docs>

## Deploy on Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Frajkaria%2F0gkit%2Ftree%2Fmain%2Ftemplates%2Freact-app&project-name=0gkit-react-app&env=NETWORK%2CWALLETCONNECT_PROJECT_ID&envDescription=See%20docs.0gkit.com%20env%20vars&envLink=https%3A%2F%2Fdocs.0gkit.com%2Fgetting-started%2Fenv-vars)

Vercel will fork the template into a new repository, prompt for the listed
env vars, and deploy in under 60 seconds on Fluid Compute.
