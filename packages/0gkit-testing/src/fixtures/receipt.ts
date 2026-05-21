import type { Receipt } from "@foundryprotocol/0gkit-core";

const DEFAULT_TX_HASH = ("0x" + "ab".repeat(32)) as `0x${string}`;

/**
 * Deterministic `Receipt` fixture. Use it anywhere a primitive's `tx` field
 * is expected — `mockStorageClient` / `mockDAClient` / generated contract
 * `write.*` tests all consume this directly, so the shape stays stable.
 */
export function fixtureReceipt(over: Partial<Receipt> = {}): Receipt {
  return {
    txHash: DEFAULT_TX_HASH,
    blockNumber: 100n,
    latencyMs: 5,
    ...over,
  };
}
