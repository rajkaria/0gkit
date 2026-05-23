# @foundryprotocol/0gkit-cli

The neutral `0g` command line — `init`, `doctor`, `chain`, `storage`, `infer`,
`da`, `attest`. Language-agnostic: any stack shells out; `--json` for scripting.
Foundry is a **separate, opt-in plugin**, never required.

## Install

```bash
# Recommended: install once, then use the short `0g` binary
npm install -g @foundryprotocol/0gkit-cli
0g doctor

# Or one-off via npx (use the full scoped name — `npx 0g` resolves to an
# unrelated package on npm):
npx @foundryprotocol/0gkit-cli doctor
```

## 60-second start (no funds, testnet)

```bash
npx @foundryprotocol/0gkit-cli init my-app && cd my-app
npm install
npx @foundryprotocol/0gkit-cli doctor                 # preflight every 0G surface
npx @foundryprotocol/0gkit-cli chain faucet 0xYourAddress   # Galileo → points you at https://faucet.0g.ai
```

## Commands

| Command                        | What                                                     |
| ------------------------------ | -------------------------------------------------------- |
| `0g init [name]`               | scaffold a runnable, testnet-default project             |
| `0g doctor`                    | RPC / signer / storage / DA / faucet checklist           |
| `0g chain faucet\|balance\|tx` | faucet guidance, native balance, await a receipt         |
| `0g storage put\|get\|exists`  | upload/download/probe 0G Storage                         |
| `0g infer`                     | chat completion against a 0G compute provider            |
| `0g da publish\|verify`        | publish a blob / local integrity check                   |
| `0g attest verify\|report`     | verify or summarize a signed attestation                 |
| `0g foundry …`                 | optional plugin — hidden unless installed or `--foundry` |

Global flags: `--network aristotle|galileo|local` (default `galileo`),
`--rpc <url>`, `--private-key <hex>`, `--json`.

## Multi-language (the CLI is the universal surface)

TypeScript:

```ts
import { Storage } from "@foundryprotocol/0gkit-storage";
const s = new Storage({
  network: "galileo",
  privateKey: process.env.ZEROG_PRIVATE_KEY,
});
const { root } = await s.upload(new TextEncoder().encode("hi"));
```

Shell / any language (parse `--json`):

```bash
ROOT=$(0g storage put ./model.bin --network galileo --json | jq -r .root)
0g storage exists "$ROOT" --json
```

curl (compute is OpenAI-compatible — see `@foundryprotocol/0gkit-compute`):

```bash
0g infer -m "hello" --provider 0xPROVIDER --json | jq -r .output
```

## Estimating & dry-run

```bash
0g estimate storage ./big-file.bin
0g estimate compute --prompt "What is 2+2?" --max-output 64
0g estimate da --bytes 4096
0g estimate contracts --abi ./MyContract.abi.json --address 0x... --method transfer --args '["0x...","1000"]'
```

Every write command also accepts `--dry-run`:

```bash
0g storage put ./file --dry-run
0g da publish ./blob --dry-run
0g infer -m "ping" --dry-run
```

`--dry-run` runs all estimation work (gas + fee + simulation) without
broadcasting a single tx. The output is a structured `DryRunResult` envelope
under `--json`, or a human `[dry-run]`-prefixed block by default.

## Environment variables

`ZEROG_NETWORK`, `ZEROG_RPC_URL`, `ZEROG_PRIVATE_KEY`, `ZEROG_BROKER_KEY`,
`ZEROG_PROVIDER`. Flags always override env; env overrides the preset default.

## Escape hatch

The CLI is a thin, faithful wrapper. Every primitive package exposes `.raw`
(or the underlying client) — drop down to `@foundryprotocol/0gkit-storage`, `@foundryprotocol/0gkit-compute`,
`@foundryprotocol/0gkit-da`, `@foundryprotocol/0gkit-attestation`, `@foundryprotocol/0gkit-chain`, `@foundryprotocol/0gkit-core` directly
whenever you outgrow a command. The toolkit is a help, never a cage.

## License

MIT.
