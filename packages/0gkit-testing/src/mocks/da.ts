import type { Receipt } from "@foundryprotocol/0gkit-core";
import { fixtureReceipt } from "../fixtures/receipt.js";

export interface MockDAOptions {
  txOverride?: Partial<Receipt>;
}

export interface MockDAClient {
  publish(bytes: Uint8Array): Promise<{ digest: string; tx: Receipt }>;
  verify(digest: string, bytes: Uint8Array): Promise<boolean>;
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
 * In-memory DA mock. `publish` archives bytes keyed by sha256; `verify`
 * returns true iff `(digest, bytes)` agree with what was published — useful
 * for "tampered bytes are caught" tests.
 */
export function mockDAClient(opts: MockDAOptions = {}): MockDAClient {
  const store = new Map<string, Uint8Array>();
  return {
    async publish(bytes) {
      const digest = await sha256Hex(bytes);
      store.set(digest, new Uint8Array(bytes));
      return { digest, tx: fixtureReceipt(opts.txOverride) };
    },
    async verify(digest, bytes) {
      const stored = store.get(digest);
      if (!stored) return false;
      const candidate = await sha256Hex(bytes);
      if (candidate !== digest) return false;
      if (stored.length !== bytes.length) return false;
      for (let i = 0; i < stored.length; i++) {
        if (stored[i] !== bytes[i]) return false;
      }
      return true;
    },
    __store() {
      return store;
    },
  };
}
