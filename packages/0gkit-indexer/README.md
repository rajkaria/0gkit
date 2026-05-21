# @foundryprotocol/0gkit-indexer

Reorg-safe, persisted-cursor event subscriptions on the 0G chain. Built on `@foundryprotocol/0gkit-contracts` typed contracts and `viem`.

## Install

```bash
pnpm add @foundryprotocol/0gkit-indexer
# optional persistence backends (sqlite ships built-in):
pnpm add ioredis     # if you want the redis cursor
```

## Quickstart

```ts
import { Indexer, MemoryCursorStore } from "@foundryprotocol/0gkit-indexer";
import { standardContracts } from "@foundryprotocol/0gkit-contracts";

const registry = standardContracts.registry({
  address: "0x...",
  network: "galileo",
});

const indexer = new Indexer({
  network: "galileo",
  cursor: new MemoryCursorStore(),
});

await indexer.subscribe({
  contract: registry,
  event: "ProviderRegistered",
  fromBlock: "latest",
  onEvent: (event) => console.log("registered:", event.args),
  onReorg: (rolled) =>
    console.warn(
      "rolled back:",
      rolled.map((r) => r.blockNumber)
    ),
});

await indexer.start();
```

## Cursor backends

- **Memory** (built-in) — `new MemoryCursorStore()`. For tests + ephemeral processes.
- **SQLite** — `import { SqliteCursorStore } from "@foundryprotocol/0gkit-indexer/cursors/sqlite"` — uses `better-sqlite3` (direct dep). Persistent across restarts.
- **Redis** — `import { RedisCursorStore } from "@foundryprotocol/0gkit-indexer/cursors/redis"` — optional peer (`pnpm add ioredis`). For multi-process or clustered deployments.

## Reorg semantics

The indexer keeps a bounded window of recent block hashes (default 64). On every poll, it re-fetches those blocks; if a hash mismatches, it walks back to the highest common ancestor, emits `onReorg(rolledBack)` for the dropped blocks, and re-emits `onEvent` from the new chain. The default `confirmations: 1` waits one block past head before delivering — set higher (e.g. 6) for stronger finality at the cost of latency.

The rolled-back `DecodedEvent`s carry `{ blockNumber, blockHash (old), eventName, address }`. Full original args are not preserved across reorgs in v0; persist your own keyed cache on `transactionHash` if you need to undo specific effects.

## React

Use `@foundryprotocol/0gkit-react`'s `useEvent` / `useLogs` hooks:

```tsx
import { ZeroGIndexerProvider, useEvent } from "@foundryprotocol/0gkit-react";

<ZeroGIndexerProvider indexer={indexer}>
  <App />
</ZeroGIndexerProvider>;

function Messages() {
  const { events, isLoading } = useEvent({
    contract: chatContract,
    event: "MessagePosted",
    fromBlock: "latest",
  });
  if (isLoading) return <p>loading…</p>;
  return (
    <ul>
      {events.map((e, i) => (
        <li key={i}>{String(e.args.body)}</li>
      ))}
    </ul>
  );
}
```

## Neutrality

`@foundryprotocol/0gkit-indexer` depends only on `viem` and `@foundryprotocol/0gkit-{core,contracts}`. Enforced by `pnpm boundary:check` in CI.

## License

MIT
