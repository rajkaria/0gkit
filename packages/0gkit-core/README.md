# @foundryprotocol/0gkit-core

Neutral 0G foundation: network presets, a viem client factory, the `Receipt`
envelope, and the `ZeroGError` taxonomy. Zero Foundry dependency — enforced in CI.

## Install

```bash
npm install @foundryprotocol/0gkit-core viem
```

## Use

```ts
import { createClient, networks } from "@foundryprotocol/0gkit-core";

const client = createClient({ network: "aristotle" });
console.log(client.public.chain?.id); // 16661
```

Errors are actionable — every `ZeroGError` has `.code` and `.hint`. `aristotle`
and `local` presets are fully resolved; `galileo` is testnet (see the repo's
`docs/superpowers/DECISIONS.md` D2 for verified endpoints).

## License

MIT.
