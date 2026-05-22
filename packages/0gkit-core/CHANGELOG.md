# @foundryprotocol/0gkit-core

## 0.3.0

### Minor Changes

- c834d6a: SP7: cost estimator + dry-run. Every primitive answers "what will this cost?" before broadcasting.
  - `0gkit-core`: new `Estimate` / `DryRunResult<T>` envelope + `formatEstimate(est)` + `formatNative(wei)`.
  - `0gkit-storage`: `Storage.estimate(bytes)` + `Storage.upload(bytes, { dryRun: true })`.
  - `0gkit-compute`: `Compute.estimate({ messages, model?, maxOutputTokens? })` + `Compute.inference(args, { dryRun: true })`. Char/4 token heuristic (D21).
  - `0gkit-da`: `DA.estimate(payload)` + `DA.publish(payload, { dryRun: true })`. Default rate `1e6 wei/byte` (D23).
  - `0gkit-contracts`: new `typedContract.estimate.<method>(...args)` namespace using `estimateContractGas` + `getGasPrice`; `write.<method>(args, { dryRun: true })` runs `simulateContract` without broadcasting.
  - `0gkit-cli`: new `0g estimate storage | compute | da | contracts` subcommands + `--dry-run` flag on `0g storage put`, `0g da publish`, `0g infer`.

## 0.2.0

### Minor Changes

- 63a297e: SP3: `0gkit-wallet` + `0gkit-wallet-react`. New `Signer` interface in
  `0gkit-core` adopted by every primitive — `new Storage({ signer })` replaces
  `new Storage({ privateKey })` (legacy stays for one minor with a deprecation
  warning). Loaders: `fromPrivateKey`, `fromFile` (keystore-v3), `fromEnv`
  (auto-picks KMS/file/PK), `fromKMS` (AWS KMS, secp256k1). SIWE: EIP-4361
  nonce/buildMessage/verify. React: `ZeroGWalletProvider` + `useWallet` /
  `useConnect` / `useSwitchNetwork` over wagmi v2.
