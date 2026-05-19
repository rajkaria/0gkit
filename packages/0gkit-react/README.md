# @foundryprotocol/0gkit-react

Neutral React hooks for 0G: `useUpload`, `useDownload`, `useInference`,
`useAttestation`. Thin reactive wrappers over `@foundryprotocol/0gkit-storage`,
`@foundryprotocol/0gkit-compute`, and `@foundryprotocol/0gkit-attestation` — no Foundry, ever. `react` is a
peer dependency.

Every hook exposes the same shape: `{ data, error, loading, reset }` plus a
named runner. The runner resolves with the value **and** rejects, so you can
either read state reactively or `await` the call directly.

## Install

```bash
npm install @foundryprotocol/0gkit-react react
# plus whichever primitive you use:
npm install @foundryprotocol/0gkit-storage @0gfoundation/0g-storage-ts-sdk ethers # uploads
npm install @foundryprotocol/0gkit-compute ethers                                  # inference
npm install @foundryprotocol/0gkit-attestation                                     # verify
```

## Use

```tsx
import { useUpload, useInference, useAttestation } from "@foundryprotocol/0gkit-react";

function Console() {
  const up = useUpload({ network: "galileo", privateKey });
  const ai = useInference({ network: "galileo", brokerKey, provider });
  const at = useAttestation();

  return (
    <button
      disabled={up.loading}
      onClick={() => up.upload(new TextEncoder().encode("hello 0G"))}
    >
      {up.loading ? "uploading…" : "upload"}
      {up.data && <code>{up.data.root}</code>}
      {up.error && <span role="alert">{up.error.message}</span>}
    </button>
  );
}
```

`useAttestation().verify(signed, expectedSigner)` never throws for a bad
signature — it resolves `{ ok: false }` with per-check detail.

## License

MIT.
