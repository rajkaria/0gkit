---
"@foundryprotocol/0gkit-core": minor
"@foundryprotocol/0gkit-wallet": minor
"@foundryprotocol/0gkit-wallet-react": minor
"@foundryprotocol/0gkit-storage": minor
"@foundryprotocol/0gkit-compute": minor
"@foundryprotocol/0gkit-da": minor
"@foundryprotocol/0gkit-attestation": minor
"@foundryprotocol/0gkit-chain": minor
---

SP3: `0gkit-wallet` + `0gkit-wallet-react`. New `Signer` interface in
`0gkit-core` adopted by every primitive — `new Storage({ signer })` replaces
`new Storage({ privateKey })` (legacy stays for one minor with a deprecation
warning). Loaders: `fromPrivateKey`, `fromFile` (keystore-v3), `fromEnv`
(auto-picks KMS/file/PK), `fromKMS` (AWS KMS, secp256k1). SIWE: EIP-4361
nonce/buildMessage/verify. React: `ZeroGWalletProvider` + `useWallet` /
`useConnect` / `useSwitchNetwork` over wagmi v2.
