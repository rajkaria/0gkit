# @foundryprotocol/0gkit-da

Neutral 0G Data Availability: deterministic digest + encoder publish + local
integrity verify. Built on @foundryprotocol/0gkit-core + viem.

## Install

```bash
npm install @foundryprotocol/0gkit-da @foundryprotocol/0gkit-core viem
```

## Use

```ts
import { DA } from "@foundryprotocol/0gkit-da";

const da = new DA({ network: "galileo" }); // omit encoder → local digest mode
const { digest, daRef, mode } = await da.publish({ hello: "world" });
const ok = da.verify({ hello: "world" }, digest);
```

`verify(payload, expectedDigest)` is a local integrity check (no network). See
the repo's `docs/superpowers/DECISIONS.md` (D3) for the DA verify scope.

## License

MIT.
