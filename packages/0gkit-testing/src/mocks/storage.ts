import { ZeroGError, type Receipt } from "@foundryprotocol/0gkit-core";
import { fixtureReceipt } from "../fixtures/receipt.js";

export interface MockStorageOptions {
  /** Provide a custom Receipt for upload calls. */
  txOverride?: Partial<Receipt>;
}

export interface MockStorageClient {
  upload(data: Uint8Array): Promise<{ root: string; tx: Receipt; raw: object }>;
  download(root: string): Promise<Uint8Array>;
  exists(root: string): Promise<boolean>;
  /** Test inspection — peek the in-memory blob store. */
  __store(): ReadonlyMap<string, Uint8Array>;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return (
    "0x" +
    Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * In-memory `Storage`-shaped mock. `upload` stores bytes keyed by sha256(bytes)
 * (the "root"), so `download(root)` round-trips deterministically. Mirrors
 * `0gkit-storage` exactly enough for tests that exercise upload→download
 * orchestration without spinning up a real 0G indexer.
 */
export function mockStorageClient(opts: MockStorageOptions = {}): MockStorageClient {
  const store = new Map<string, Uint8Array>();
  return {
    async upload(data) {
      const root = await sha256Hex(data);
      store.set(root, new Uint8Array(data));
      return {
        root,
        tx: fixtureReceipt(opts.txOverride),
        raw: { mock: true, bytes: data.length },
      };
    },
    async download(root) {
      const got = store.get(root);
      if (!got) {
        throw new ZeroGError(
          "STORAGE_ROOT_NOT_FOUND",
          `mockStorageClient: root ${root} not found`,
          "The mock storage client's in-memory map has no blob keyed by this root. Either upload() the data first in this test, or pre-seed the store via __store() before calling download()."
        );
      }
      return new Uint8Array(got);
    },
    async exists(root) {
      return store.has(root);
    },
    __store() {
      return store;
    },
  };
}
