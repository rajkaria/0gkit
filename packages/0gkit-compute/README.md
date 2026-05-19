# @foundryprotocol/0gkit-compute

Neutral 0G Compute: provider discovery, broker inference, and an
OpenAI-compatible shim. Built on @foundryprotocol/0gkit-core. The
`@0gfoundation/0g-compute-ts-sdk` and `ethers` are optional peers.

## Install

```bash
npm install @foundryprotocol/0gkit-compute @foundryprotocol/0gkit-core viem
npm install @0gfoundation/0g-compute-ts-sdk ethers
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
