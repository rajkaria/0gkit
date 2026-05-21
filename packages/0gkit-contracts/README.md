# @foundryprotocol/0gkit-contracts

Typed contract clients for 0G. **No hand-written ABIs.**

- Five standard 0G contracts pre-bundled — ERC-20, ERC-721, Multicall3, provider registry, attestation verifier.
- Wagmi-style `.read.method()` / `.write.method()` / `.events.Event()` — full IntelliSense, zero `any`.
- `0g contracts generate --abi <forge-artifact>.json --out <dir>` consumes Foundry build output and emits typed `.ts` clients.

```bash
npm i @foundryprotocol/0gkit-contracts viem
```

## Standard contracts

```ts
import { standardContracts } from "@foundryprotocol/0gkit-contracts";

// Multicall3 is universal — same address on every EVM chain.
const m3 = standardContracts.multicall3({ network: "galileo" });
const block = await m3.read.getBlockNumber();

// ERC-20 needs an address (no per-network singleton).
const usdc = standardContracts.erc20({
  address: "0xa0b8...e3c8",
  network: "galileo",
  signer, // optional; required for .write.*
});
const balance = await usdc.read.balanceOf("0x1234...");
const tx = await usdc.write.transfer("0xabcd...", 100n);
console.log(tx.txHash, tx.blockNumber);
```

| Contract              | Network address                      | Status                                                     |
| --------------------- | ------------------------------------ | ---------------------------------------------------------- |
| `multicall3`          | Universal                            | Auto-resolved per network                                  |
| `erc20`               | Per-deployment                       | Pass `{ address }`                                         |
| `erc721`              | Per-deployment                       | Pass `{ address }`                                         |
| `registry`            | Pinned per network when 0G publishes | Throws CONFIG with hint until then; pass `{ address }` now |
| `attestationVerifier` | Pinned per network when 0G publishes | Throws CONFIG with hint until then; pass `{ address }` now |

## Codegen — your own contracts

After `forge build`, point `0g contracts generate` at the artifact:

```bash
0g contracts generate \
  --abi out/MyContract.sol/MyContract.json \
  --out src/contracts
```

Emits one `.ts` file per contract:

```ts
import { MyContract } from "./contracts/MyContract";

const c = MyContract.attach({ address: "0x...", signer });
const value = await c.read.totalSupply(); // typed bigint
const tx = await c.write.transfer(to, amount); // returns Receipt
const events = await c.events.Transfer({ fromBlock: 0n });
```

Generated code passes `tsc --strict --noEmit` with zero `any`. Output is byte-deterministic — same artifact in, same TS out — so diffs in PR are obvious.

### Programmatic codegen

```ts
import { generate } from "@foundryprotocol/0gkit-contracts/codegen";

await generate({
  abiPath: "out/MyContract.sol/MyContract.json",
  outDir: "src/contracts",
  name: "MyContract", // optional override
});
```

## Custom contracts via `createTypedContract`

For one-offs where codegen would be overkill:

```ts
import { createTypedContract } from "@foundryprotocol/0gkit-contracts";
import { parseAbi } from "viem";

const c = createTypedContract({
  abi: parseAbi(["function ping() view returns (uint256)"]),
  address: "0x...",
  network: "galileo",
});
const n = await c.read.ping();
```

## CLI

```bash
0g contracts list                       # show bundled standard contracts
0g contracts info erc20                 # methods + events for one contract
0g contracts generate --abi <p> --out <d>  # codegen from Foundry artifact
```

## API

### `createTypedContract({ abi, address, signer?, ... })`

Returns `{ read, write, events, address, abi }`.

- `read.<method>(args)` — delegates to `viem.getContract`.
- `write.<method>(args)` — submits via the wallet client, awaits the receipt, returns `{ txHash, blockNumber, latencyMs }` (the `0gkit-core.Receipt` shape). Requires `{ signer }` whose `privateKey` is exposed (the `fromPrivateKey` / `fromFile` / `fromEnv` loaders from `0gkit-wallet`).
- `events.<EventName>({ fromBlock?, toBlock?, args? })` — pull-only log query via `viem.getLogs`. SP6 (`0gkit-indexer`) adds live subscriptions with reorg safety.

### Errors

All thrown errors are `0gkit-core.ZeroGError` subclasses with a `code` and a one-line `hint`:

- `CONFIG` — wrong/missing args, or a non-pinned contract address. Includes a remedy.
- `CHAIN` — viem write/read/getLogs failed. Original message preserved.

## License

MIT
