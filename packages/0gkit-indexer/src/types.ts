// packages/0gkit-indexer/src/types.ts
import type { Abi, Address, Hex } from "viem";
import type { NetworkName } from "@foundryprotocol/0gkit-core";

/**
 * Persisted indexer state for one subscription.
 * `recentBlocks` is a bounded window of the most recent canonical blocks,
 * used to detect reorgs by comparing hashes on the next poll.
 */
export interface CursorState {
  /** The highest block whose logs have been fully delivered to onEvent. */
  lastBlock: bigint;
  /** Bounded window (default 64) of recent blocks, oldest → newest. */
  recentBlocks: Array<{ number: bigint; hash: Hex }>;
}

/** Pluggable persistence for cursor state. */
export interface CursorStore {
  /** Returns null if no state has been saved for this subscriptionId. */
  load(subscriptionId: string): Promise<CursorState | null>;
  save(subscriptionId: string, state: CursorState): Promise<void>;
  /** Optional teardown (e.g. close DB handles). */
  close?(): Promise<void>;
}

/**
 * A decoded event delivered to onEvent / onReorg.
 * Mirrors viem's getLogs return shape with a decoded args field.
 */
export interface DecodedEvent {
  eventName: string;
  args: Record<string, unknown>;
  address: Address;
  blockNumber: bigint;
  blockHash: Hex;
  transactionHash: Hex;
  transactionIndex: number;
  logIndex: number;
  topics: readonly Hex[];
  data: Hex;
}

export type FromBlock = "latest" | "earliest" | bigint;

export interface SubscribeOptions {
  /**
   * A typed contract from `@foundryprotocol/0gkit-contracts`
   * (gives us `address` + `abi` together). Plain `{ address, abi }` also works.
   */
  contract: { address: Address; abi: Abi };
  /** Event name on the contract ABI. */
  event: string;
  /** Where to start. "latest" = head of chain at start time. Default "latest". */
  fromBlock?: FromBlock;
  /** Called for every event in canonical chain order. */
  onEvent: (event: DecodedEvent) => Promise<void> | void;
  /** Called when blocks are rolled back; events come in reverse chain order. */
  onReorg?: (rolledBack: DecodedEvent[]) => Promise<void> | void;
  /**
   * Override the auto-generated subscription id (used as cursor key).
   * Default: `sha1(address|event|fromBlock)`.
   */
  subscriptionId?: string;
}

export interface IndexerOptions {
  network: NetworkName;
  /** Overrides the preset RPC URL (matches 0gkit-core createClient). */
  rpcUrl?: string;
  /** Override chain id (matches 0gkit-core createClient). */
  chainId?: number;
  /** Cursor backend. Default MemoryCursorStore. */
  cursor?: CursorStore;
  /** Poll interval in ms. Default 2000. */
  pollIntervalMs?: number;
  /** Reorg-safety depth — how many head blocks to keep in the window. Default 64. */
  reorgDepth?: number;
  /**
   * Confirmations: don't deliver events until this many blocks past head.
   * Default 1 (i.e. deliver newest fully-canonical block immediately).
   */
  confirmations?: number;
}

export interface IndexerStatus {
  running: boolean;
  subscriptions: number;
  headBlock: bigint | null;
  /** Last successful poll completion. */
  lastPollAt: number | null;
  /** Consecutive failure count (resets on success). */
  failures: number;
}
