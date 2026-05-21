import { describe, it, expect } from "vitest";
import { parseAbi, encodeEventTopics, type Hex } from "viem";
import { Indexer } from "../indexer.js";
import { MemoryCursorStore } from "../cursors/memory.js";

const abi = parseAbi(["event Ping(uint256 n)", "event Pong(uint256 n)"]);
const [pingTopic] = encodeEventTopics({ abi, eventName: "Ping" });
const [pongTopic] = encodeEventTopics({ abi, eventName: "Pong" });

const blockHash = (n: number): Hex => ("0x" + n.toString(16).padStart(64, "0")) as Hex;

describe("Indexer (multi-subscription)", () => {
  it("delivers events to distinct subscriptions on the same address", async () => {
    const address = "0xababababababababababababababababababababab" as const;
    let head = 3n;
    const blocks = new Map<bigint, Hex>([
      [1n, blockHash(1)],
      [2n, blockHash(2)],
      [3n, blockHash(3)],
    ]);

    const allLogs = [
      {
        address,
        blockNumber: 1n,
        blockHash: blocks.get(1n)!,
        transactionHash: "0x01" as Hex,
        transactionIndex: 0,
        logIndex: 0,
        topics: [pingTopic!] as readonly Hex[],
        data: "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex,
      },
      {
        address,
        blockNumber: 2n,
        blockHash: blocks.get(2n)!,
        transactionHash: "0x02" as Hex,
        transactionIndex: 0,
        logIndex: 1,
        topics: [pongTopic!] as readonly Hex[],
        data: "0x0000000000000000000000000000000000000000000000000000000000000002" as Hex,
      },
    ];

    // suppress unused warning — head is intentionally captured via closure
    void head;

    const client = {
      getBlockNumber: async () => 3n,
      getBlock: async (args: { blockNumber: bigint }) => ({
        hash: blocks.get(args.blockNumber)!,
        number: args.blockNumber,
      }),
      getLogs: async () => allLogs,
    };

    const pings: bigint[] = [];
    const pongs: bigint[] = [];

    const indexer = new Indexer({
      network: "local",
      cursor: new MemoryCursorStore(),
      pollIntervalMs: 10,
      confirmations: 1,
      reorgDepth: 8,
      publicClient: client as never,
    });

    await indexer.subscribe({
      contract: { address, abi },
      event: "Ping",
      fromBlock: 1n,
      onEvent: (e) => {
        pings.push(e.blockNumber);
      },
    });
    await indexer.subscribe({
      contract: { address, abi },
      event: "Pong",
      fromBlock: 1n,
      onEvent: (e) => {
        pongs.push(e.blockNumber);
      },
    });

    await indexer.start();
    await new Promise((r) => setTimeout(r, 60));
    await indexer.stop();

    expect(pings).toEqual([1n]);
    expect(pongs).toEqual([2n]);
  });

  it("status() reports subscription count + head", async () => {
    const client = {
      getBlockNumber: async () => 42n,
      getBlock: async () => ({ hash: blockHash(42), number: 42n }),
      getLogs: async () => [],
    };
    const indexer = new Indexer({
      network: "local",
      pollIntervalMs: 1000,
      confirmations: 1,
      reorgDepth: 8,
      publicClient: client as never,
    });
    await indexer.subscribe({
      contract: { address: ("0xcd" + "00".repeat(19)) as `0x${string}`, abi },
      event: "Ping",
      fromBlock: 1n,
      onEvent: () => {},
    });
    await indexer.start();
    const s = indexer.status();
    await indexer.stop();
    expect(s.running).toBe(true);
    expect(s.subscriptions).toBe(1);
    expect(s.headBlock).toBe(42n);
  });
});
