# @foundryprotocol/0gkit-wallet-react

## 0.3.0

### Patch Changes

- Updated dependencies [c834d6a]
  - @foundryprotocol/0gkit-core@0.3.0
  - @foundryprotocol/0gkit-wallet@0.3.0

## 0.2.0

### Minor Changes

- 63a297e: SP3: `0gkit-wallet` + `0gkit-wallet-react`. New `Signer` interface in
  `0gkit-core` adopted by every primitive — `new Storage({ signer })` replaces
  `new Storage({ privateKey })` (legacy stays for one minor with a deprecation
  warning). Loaders: `fromPrivateKey`, `fromFile` (keystore-v3), `fromEnv`
  (auto-picks KMS/file/PK), `fromKMS` (AWS KMS, secp256k1). SIWE: EIP-4361
  nonce/buildMessage/verify. React: `ZeroGWalletProvider` + `useWallet` /
  `useConnect` / `useSwitchNetwork` over wagmi v2.

### Patch Changes

- Updated dependencies [63a297e]
  - @foundryprotocol/0gkit-core@0.2.0
  - @foundryprotocol/0gkit-wallet@0.2.0
