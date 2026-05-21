import { describe, it, expect } from "vitest";
import { parseAbi, encodeEventTopics, type Hex } from "viem";
import { Indexer } from "../indexer.js";
import { MemoryCursorStore } from "../cursors/memory.js";

const abi = parseAbi(["event Ping(uint256 n)"]);
const [topic0] = encodeEventTopics({ abi, eventName: "Ping" });

function blockHash(n: number): Hex {
  return ("0x" + n.toString(16).padStart(64, "0")) as Hex;
}

interface FakeLog {
  address: `0x${string}`;
  blockNumber: bigint;
  blockHash: Hex;
  transactionHash: Hex;
  transactionIndex: number;
  logIndex: number;
  topics: readonly Hex[];
  data: Hex;
}

function makeFakeClient(
  blocksByNumber: Map<bigint, { hash: Hex }>,
  logsByRange: (from: bigint, to: bigint) => FakeLog[]
) {
  let head: bigint = 0n;
  for (const n of blocksByNumber.keys()) {
    if (n > head) head = n;
  }
  return {
    getBlockNumber: async () => head,
    getBlock: async (args: { blockNumber: bigint }) => {
      const b = blocksByNumber.get(args.blockNumber);
      if (!b) throw new Error(`no block ${args.blockNumber}`);
      return { hash: b.hash, number: args.blockNumber };
    },
    getLogs: async (args: { fromBlock: bigint; toBlock: bigint }) =>
      logsByRange(args.fromBlock, args.toBlock),
  };
}

describe("Indexer (basic, no reorgs)", () => {
  it("emits historical events on start, then live events on subsequent polls", async () => {
    const address = "0xcafecafecafecafecafecafecafecafecafecafe" as const;
    const blocks = new Map<bigint, { hash: Hex }>();
    for (let n = 1n; n <= 5n; n++) blocks.set(n, { hash: blockHash(Number(n)) });

    const mkLog = (n: bigint, idx: number, value: number): FakeLog => ({
      address,
      blockNumber: n,
      blockHash: blockHash(Number(n)),
      transactionHash: blockHash(Number(n) + 1000),
      transactionIndex: 0,
      logIndex: idx,
      topics: [topic0!],
      data: ("0x" + value.toString(16).padStart(64, "0")) as Hex,
    });

    const client = makeFakeClient(blocks, (from, to) => {
      const out: FakeLog[] = [];
      for (let n = from; n <= to; n++) out.push(mkLog(n, 0, Number(n)));
      return out;
    });

    const seen: Array<{ block: bigint; n: bigint }> = [];
    const indexer = new Indexer({
      network: "local",
      cursor: new MemoryCursorStore(),
      pollIntervalMs: 10,
      confirmations: 1,
      reorgDepth: 16,
      publicClient: client as never,
    });

    await indexer.subscribe({
      contract: { address, abi },
      event: "Ping",
      fromBlock: 1n,
      onEvent: (e) => {
        seen.push({ block: e.blockNumber, n: (e.args as { n: bigint }).n });
      },
    });

    await indexer.start();
    await new Promise((r) => setTimeout(r, 80));
    await indexer.stop();

    // head=5, confirmations=1 => safeHead = head - conf + 1 = 5
    // so blocks 1..5 are delivered.
    expect(seen.map((s) => Number(s.block))).toEqual([1, 2, 3, 4, 5]);
  });

  it("persists cursor: restart picks up after the last delivered block", async () => {
    const address = "0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead" as const;
    const blocks = new Map<bigint, { hash: Hex }>();
    for (let n = 1n; n <= 3n; n++) blocks.set(n, { hash: blockHash(Number(n)) });

    const mkLog = (n: bigint): FakeLog => ({
      address,
      blockNumber: n,
      blockHash: blockHash(Number(n)),
      transactionHash: blockHash(Number(n) + 2000),
      transactionIndex: 0,
      logIndex: 0,
      topics: [topic0!],
      data: ("0x" + Number(n).toString(16).padStart(64, "0")) as Hex,
    });

    const client = makeFakeClient(blocks, (from, to) => {
      const logs: FakeLog[] = [];
      for (let n = from; n <= to; n++) logs.push(mkLog(n));
      return logs;
    });

    const cursor = new MemoryCursorStore();
    const subId = "test-restart";

    const seen1: bigint[] = [];
    const i1 = new Indexer({
      network: "local",
      cursor,
      pollIntervalMs: 10,
      confirmations: 1,
      reorgDepth: 16,
      publicClient: client as never,
    });
    await i1.subscribe({
      contract: { address, abi },
      event: "Ping",
      fromBlock: 1n,
      subscriptionId: subId,
      onEvent: (e) => {
        seen1.push(e.blockNumber);
      },
    });
    await i1.start();
    await new Promise((r) => setTimeout(r, 60));
    await i1.stop();
    expect(seen1).toEqual([1n, 2n, 3n]); // head=3, confirmations=1 => safeHead = 3

    const seen2: bigint[] = [];
    const i2 = new Indexer({
      network: "local",
      cursor,
      pollIntervalMs: 10,
      confirmations: 1,
      reorgDepth: 16,
      publicClient: client as never,
    });
    await i2.subscribe({
      contract: { address, abi },
      event: "Ping",
      fromBlock: 1n,
      subscriptionId: subId,
      onEvent: (e) => {
        seen2.push(e.blockNumber);
      },
    });
    await i2.start();
    await new Promise((r) => setTimeout(r, 60));
    await i2.stop();
    expect(seen2).toEqual([]); // nothing new — head still 3, last delivered was 3
  });
});
