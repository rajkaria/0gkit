# @foundryprotocol/0gkit-storage

Neutral 0G Storage: upload, download, computeRoot, and exists. Built on
@foundryprotocol/0gkit-core. The `@0gfoundation/0g-storage-ts-sdk` and `ethers` are optional
peers (install them for uploads).

## Install

```bash
npm install @foundryprotocol/0gkit-storage @foundryprotocol/0gkit-core viem
npm install @0gfoundation/0g-storage-ts-sdk ethers # for uploads
```

## Use

```ts
import { Storage } from "@foundryprotocol/0gkit-storage";

const storage = new Storage({ network: "galileo", privateKey });
const { root, tx } = await storage.upload(new Uint8Array([1, 2, 3]));
const bytes = await storage.download(root);
```

## License

MIT.
