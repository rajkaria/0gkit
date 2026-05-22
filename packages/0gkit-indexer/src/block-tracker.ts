import type { Hex } from "viem";
import { ZeroGError } from "@foundryprotocol/0gkit-core";

export interface TrackedBlock {
  number: bigint;
  hash: Hex;
}

export interface BlockTrackerOptions {
  /** Number of recent blocks to retain. */
  depth: number;
}

/**
 * Bounded-window store of the most recent canonical block hashes.
 *
 * Used by the indexer for reorg detection: on every poll, we compare the
 * remote chain's recent block hashes against our window and walk back to
 * the highest common ancestor.
 *
 * Backed by an Array (kept small by `depth`); preserves insertion order
 * (oldest first, head last).
 */
export class BlockTracker {
  private readonly depth: number;
  private blocks: TrackedBlock[] = [];

  constructor(opts: BlockTrackerOptions) {
    if (opts.depth < 1) {
      throw new ZeroGError(
        "CONFIG_INVALID_ARGUMENT",
        "BlockTracker depth must be >= 1",
        "Pass an integer >= 1 for depth (the number of recent block hashes to retain for reorg detection)."
      );
    }
    this.depth = opts.depth;
  }

  get size(): number {
    return this.blocks.length;
  }

  head(): TrackedBlock | null {
    return this.blocks.length === 0
      ? null
      : (this.blocks[this.blocks.length - 1] ?? null);
  }

  snapshot(): TrackedBlock[] {
    return this.blocks.map((b) => ({ ...b }));
  }

  push(block: TrackedBlock): void {
    this.blocks.push(block);
    if (this.blocks.length > this.depth) {
      this.blocks.splice(0, this.blocks.length - this.depth);
    }
  }

  hydrate(blocks: readonly TrackedBlock[]): void {
    const trimmed = blocks.slice(Math.max(0, blocks.length - this.depth));
    this.blocks = trimmed.map((b) => ({ ...b }));
  }

  /**
   * Given a remote chain view (same block numbers as our window), returns
   * the highest block where number+hash agree. Null = chains diverged
   * before our visible window (caller should resync from earliest known).
   */
  findCommonAncestor(remote: readonly TrackedBlock[]): TrackedBlock | null {
    const remoteByNumber = new Map<bigint, Hex>();
    for (const b of remote) remoteByNumber.set(b.number, b.hash);
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const ours = this.blocks[i];
      if (!ours) continue;
      const theirs = remoteByNumber.get(ours.number);
      if (theirs && theirs === ours.hash) return { ...ours };
    }
    return null;
  }

  /** Drop blocks strictly higher than `ancestor.number`. */
  truncateAfter(ancestor: TrackedBlock): void {
    this.blocks = this.blocks.filter((b) => b.number <= ancestor.number);
  }
}
