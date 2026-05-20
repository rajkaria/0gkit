# @foundryprotocol/0gkit-compute

Neutral 0G Compute: provider discovery, broker inference, and an
OpenAI-compatible shim. Built on @foundryprotocol/0gkit-core. The
`@0gfoundation/0g-compute-ts-sdk` and `ethers` are optional peers.

## Install

```bash
npm install @foundryprotocol/0gkit-compute @foundryprotocol/0gkit-core viem
npm install @0gfoundation/0g-compute-ts-sdk ethers@6.13.1
# ethers is pinned to 6.13.1 by @0gfoundation/0g-storage-ts-sdk; using the same
# version here keeps the two SDKs installable side by side.
```

## Use

```ts
import { Compute } from "@foundryprotocol/0gkit-compute";

const compute = new Compute({ brokerKey, provider });
const { output, receipt } = await compute.inference({
  messages: [{ role: "user", content: "Hello 0G" }],
});

// Or drop-in OpenAI-style:
const oa = compute.openai();
const res = await oa.chat.completions.create({
  messages: [{ role: "user", content: "Hello 0G" }],
});
```

## License

MIT.
