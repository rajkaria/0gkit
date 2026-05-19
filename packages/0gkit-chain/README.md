# @foundryprotocol/0gkit-chain

Neutral 0G chain helpers built on `@foundryprotocol/0gkit-core` + `viem`: `explorerUrl`,
`balance`, `waitForReceipt`, and a testnet `faucet`.

## Install

```bash
npm install @foundryprotocol/0gkit-chain @foundryprotocol/0gkit-core viem
```

## Use

```ts
import { createClient } from "@foundryprotocol/0gkit-core";
import { balance, waitForReceipt } from "@foundryprotocol/0gkit-chain";

const client = createClient({ network: "aristotle" });
const wei = await balance(client, "0xYourAddress");
const receipt = await waitForReceipt(client, "0xTxHash");
console.log(receipt.explorerUrl); // present iff the network has a verified explorer
```

## License

MIT.
