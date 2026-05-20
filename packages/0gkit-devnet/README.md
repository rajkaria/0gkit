# @foundryprotocol/0gkit-devnet

> Local chain + storage + compute + DA stack for 0G app development.

Powers the `0g dev` CLI. Spins up a complete local 0G environment so you can build
without waiting on the Galileo faucet or paying for testnet gas.

## What it runs

| Service     | What                                                         | Default port |
| ----------- | ------------------------------------------------------------ | ------------ |
| **chain**   | `anvil` (shelled out — install with `foundryup`)             | 8545         |
| **storage** | Node HTTP server, filesystem CAS at `~/.0g-dev/storage`      | 5678         |
| **compute** | OpenAI-compatible HTTP server (Ollama if running, else stub) | 5679         |
| **da**      | In-memory canonical-digest store                             | 5680         |

10 deterministic prefunded accounts (10,000 ETH each) using the standard anvil
dev mnemonic. Apps written against `network: "local"` and against `network: "galileo"`
are byte-identical — only the preset changes.

## Usage

```bash
# From the CLI (recommended)
0g dev start
0g dev status
0g dev stop

# Programmatic (in tests, etc.)
import { startDevnet, stopDevnet } from "@foundryprotocol/0gkit-devnet";

const handle = await startDevnet({ accounts: 3 });
// ... use handle.chain.url, handle.accounts[0].privateKey, etc.
await handle.stop();
```

## Prerequisites

- `anvil` on `PATH`. Install once with:
  ```
  curl -L https://foundry.paradigm.xyz | bash && foundryup
  ```

## Known divergences from live network

The mocks implement the same wire protocol as the real services but:

- Storage's Merkle root is computed by the real `@0gfoundation/0g-storage-ts-sdk`
  when injected; otherwise the mock returns a deterministic SHA-256-derived
  root that round-trips locally but won't match real-network roots.
- Compute's "stub" mode echoes the prompt with a `[MOCK]` prefix. If `ollama serve`
  is detected at `localhost:11434`, the mock proxies to it.
- DA's digest is SHA-256(bytes) — matches the documented canonical digest shape.

## License

MIT
