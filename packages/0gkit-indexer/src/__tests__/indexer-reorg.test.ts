import { describe, it, expect } from "vitest";
import { parseAbi, encodeEventTopics, type Hex } from "viem";
import { Indexer } from "../indexer.js";
import { MemoryCursorStore } from "../cursors/memory.js";

const abi = parseAbi(["event Ping(uint256 n)"]);
const [topic0] = encodeEventTopics({ abi, eventName: "Ping" });

function h(label: string, n: number): Hex {
  const tag = label.charCodeAt(0).toString(16).padStart(2, "0");
  return ("0x" + tag + n.toString(16).padStart(62, "0")) as Hex;
}

describe("Indexer (reorg)", () => {
  it("emits onReorg with rolled-back events, then re-emits new-chain events", async () => {
    const address = "0xfeedfeedfeedfeedfeedfeedfeedfeedfeedfeed" as const;

    type Phase = "A" | "B";
    let phase: Phase = "A";

    function blockHashFor(n: bigint, ph: Phase): Hex {
      return h(ph, Number(n));
    }
    function logsForRange(from: bigint, to: bigint, ph: Phase) {
      const out: Array<{
        address: typeof address;
        blockNumber: bigint;
        blockHash: Hex;
        transactionHash: Hex;
        transactionIndex: number;
        logIndex: number;
        topics: readonly Hex[];
        data: Hex;
      }> = [];
      for (let n = from; n <= to; n++) {
        const v = (ph === "A" ? 100 : 200) + Number(n);
        out.push({
          address,
          blockNumber: n,
          blockHash: blockHashFor(n, ph),
          transactionHash: ("0x" + v.toString(16).padStart(64, "0")) as Hex,
          transactionIndex: 0,
          logIndex: 0,
          topics: [topic0!],
          data: ("0x" + v.toString(16).padStart(64, "0")) as Hex,
        });
      }
      return out;
    }

    let head = 5n;
    const client = {
      getBlockNumber: async () => head,
      getBlock: async (args: { blockNumber: bigint }) => ({
        hash: blockHashFor(args.blockNumber, phase),
        number: args.blockNumber,
      }),
      getLogs: async (args: { fromBlock: bigint; toBlock: bigint }) =>
        logsForRange(args.fromBlock, args.toBlock, phase),
    };

    const delivered: Array<{ phase: Phase; n: bigint }> = [];
    const rolledBack: bigint[] = [];

    const indexer = new Indexer({
      network: "local",
      cursor: new MemoryCursorStore(),
      pollIntervalMs: 15,
      confirmations: 1,
      reorgDepth: 8,
      publicClient: client as never,
    });

    await indexer.subscribe({
      contract: { address, abi },
      event: "Ping",
      fromBlock: 1n,
      onEvent: (e) => {
        delivered.push({ phase, n: (e.args as { n: bigint }).n });
      },
      onReorg: (events) => {
        for (const e of events) rolledBack.push(e.blockNumber);
      },
    });

    await indexer.start();
    // let the poll deliver phase-A events
    await new Promise((r) => setTimeout(r, 50));

    // Simulate reorg: blocks 3-5 replaced on phase B; head advances to 6.
    phase = "B";
    head = 6n;

    await new Promise((r) => setTimeout(r, 80));
    await indexer.stop();

    // The event's decoded `n` arg is `100 + blockNumber` in phase A and
    // `200 + blockNumber` in phase B (the test's Ping data encodes value, not
    // the block index). So we assert on the value sequence per phase rather
    // than treating `n` as a block number.
    const deliveredValues = delivered.map((d) => Number(d.n));
    // initial A: blocks 1..5 → values 101..105
    expect(deliveredValues.slice(0, 5)).toEqual([101, 102, 103, 104, 105]);
    // After reorg, B re-emits from ancestor+1 forward, ending at the new safe head (6).
    // The naive `h(phase, n)` hash differs for every block between A and B, so
    // `findCommonAncestor` returns null and the indexer rewinds to `fromBlock - 1n`,
    // re-delivering 1..6 under phase B (values 201..206).
    //
    // Assertions:
    //  - rolledBack saw at least one rolled-back block (reorg detected)
    //  - Phase B re-emitted at least 6 events (1..6) after the rewind
    //  - Every phase-B re-emit is in the 201..206 range
    expect(rolledBack.length).toBeGreaterThan(0);
    const phaseBValues = deliveredValues.slice(5);
    expect(phaseBValues.length).toBeGreaterThanOrEqual(6);
    for (const v of phaseBValues) {
      expect(v).toBeGreaterThanOrEqual(201);
      expect(v).toBeLessThanOrEqual(206);
    }
  });
});
