# @foundryprotocol/0gkit-attestation

Neutral 0G TEE attestation: parse, sign (EIP-191), recover, verify, and report.
Pure crypto on @foundryprotocol/0gkit-core + viem — no network.

## Install

```bash
npm install @foundryprotocol/0gkit-attestation @foundryprotocol/0gkit-core viem
```

## Use

```ts
import { signEnvelope, verifyEnvelope } from "@foundryprotocol/0gkit-attestation";

const signed = await signEnvelope(envelope, privateKey);
const { ok, signer } = await verifyEnvelope(signed, expectedCoordinator);
```

Signatures are EIP-191 personal-sign over the canonical-JSON keccak digest, so
they verify the same way on-chain.

## License

MIT.
