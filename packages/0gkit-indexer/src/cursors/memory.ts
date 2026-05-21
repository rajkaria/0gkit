import type { CursorState, CursorStore } from "../types.js";

function cloneState(s: CursorState): CursorState {
  return {
    lastBlock: s.lastBlock,
    recentBlocks: s.recentBlocks.map((b) => ({ number: b.number, hash: b.hash })),
  };
}

export class MemoryCursorStore implements CursorStore {
  private map = new Map<string, CursorState>();

  async load(subscriptionId: string): Promise<CursorState | null> {
    const v = this.map.get(subscriptionId);
    return v ? cloneState(v) : null;
  }

  async save(subscriptionId: string, state: CursorState): Promise<void> {
    this.map.set(subscriptionId, cloneState(state));
  }
}
