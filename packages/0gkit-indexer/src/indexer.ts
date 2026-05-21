import { createHash } from "node:crypto";
import { createPublicClient, http, type PublicClient, type Hex } from "viem";
import {
  buildChain,
  getNetwork,
  ConfigError,
  NetworkError,
} from "@foundryprotocol/0gkit-core";
import { MemoryCursorStore } from "./cursors/memory.js";
import { BlockTracker } from "./block-tracker.js";
import { decodeOne, topicForEvent } from "./log-decoder.js";
import { expBackoffWithJitter } from "./backoff.js";
import type {
  CursorState,
  CursorStore,
  DecodedEvent,
  IndexerOptions,
  IndexerStatus,
  SubscribeOptions,
} from "./types.js";

interface InternalSubscription {
  id: string;
  address: `0x${string}`;
  abi: SubscribeOptions["contract"]["abi"];
  event: string;
  topic0: Hex;
  fromBlock: bigint;
  onEvent: SubscribeOptions["onEvent"];
  onReorg?: SubscribeOptions["onReorg"];
  cursorState: CursorState;
  tracker: BlockTracker;
}

interface IndexerInternalOptions extends IndexerOptions {
  /** Test seam: inject a viem PublicClient (or any duck-typed equivalent). */
  publicClient?: PublicClient;
}

export class Indexer {
  private readonly opts: IndexerInternalOptions & {
    pollIntervalMs: number;
    reorgDepth: number;
    confirmations: number;
  };
  private readonly cursor: CursorStore;
  private readonly subscriptions = new Map<string, InternalSubscription>();
  private client: PublicClient | null = null;
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private headBlock: bigint | null = null;
  private lastPollAt: number | null = null;
  private failures = 0;

  constructor(opts: IndexerInternalOptions) {
    this.opts = {
      ...opts,
      pollIntervalMs: opts.pollIntervalMs ?? 2000,
      reorgDepth: opts.reorgDepth ?? 64,
      confirmations: opts.confirmations ?? 1,
    };
    this.cursor = opts.cursor ?? new MemoryCursorStore();
  }

  status(): IndexerStatus {
    return {
      running: this.running,
      subscriptions: this.subscriptions.size,
      headBlock: this.headBlock,
      lastPollAt: this.lastPollAt,
      failures: this.failures,
    };
  }

  private buildClient(): PublicClient {
    if (this.opts.publicClient) return this.opts.publicClient;
    const preset = getNetwork(this.opts.network);
    const chain = buildChain(preset, this.opts.rpcUrl, this.opts.chainId);
    const transport = http(chain.rpcUrls.default.http[0]);
    return createPublicClient({ chain, transport });
  }

  async subscribe(req: SubscribeOptions): Promise<{ id: string }> {
    if (!req.contract?.address || !req.contract?.abi) {
      throw new ConfigError(
        "subscribe(): contract must have { address, abi }.",
        "Pass a TypedContract from @foundryprotocol/0gkit-contracts, or a plain { address, abi } literal."
      );
    }
    const topic0 = topicForEvent(req.contract.abi, req.event);
    const id =
      req.subscriptionId ??
      createHash("sha1")
        .update(
          `${req.contract.address}|${req.event}|${String(req.fromBlock ?? "latest")}`
        )
        .digest("hex")
        .slice(0, 16);

    if (this.subscriptions.has(id)) {
      throw new ConfigError(
        `subscribe(): subscriptionId "${id}" already registered.`,
        "Pass a unique subscriptionId, or unsubscribe the existing one first."
      );
    }

    const persisted = await this.cursor.load(id);
    let resolvedFromBlock: bigint;
    if (persisted) {
      resolvedFromBlock = persisted.lastBlock + 1n;
    } else if (req.fromBlock === "latest" || req.fromBlock === undefined) {
      resolvedFromBlock = -1n; // sentinel — resolve on first poll
    } else if (req.fromBlock === "earliest") {
      resolvedFromBlock = 0n;
    } else {
      resolvedFromBlock = req.fromBlock;
    }

    const tracker = new BlockTracker({ depth: this.opts.reorgDepth });
    if (persisted) tracker.hydrate(persisted.recentBlocks);

    const sub: InternalSubscription = {
      id,
      address: req.contract.address,
      abi: req.contract.abi,
      event: req.event,
      topic0,
      fromBlock: resolvedFromBlock,
      onEvent: req.onEvent,
      onReorg: req.onReorg,
      cursorState: persisted ?? {
        lastBlock: resolvedFromBlock === -1n ? -1n : resolvedFromBlock - 1n,
        recentBlocks: [],
      },
      tracker,
    };
    this.subscriptions.set(id, sub);
    return { id };
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.client = this.buildClient();
    this.running = true;
    // resolve "latest" sentinels on first start
    const head = await this.callWithBackoff(() => this.client!.getBlockNumber());
    for (const sub of this.subscriptions.values()) {
      if (sub.fromBlock === -1n) {
        sub.fromBlock = head;
        sub.cursorState.lastBlock = head - 1n;
      }
    }
    await this.pollOnce().catch(() => {
      /* swallow — counted in failures */
    });
    this.timer = setInterval(() => {
      void this.pollOnce();
    }, this.opts.pollIntervalMs);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.cursor.close) await this.cursor.close();
  }

  private async pollOnce(): Promise<void> {
    if (!this.running || !this.client) return;
    try {
      const head = await this.client.getBlockNumber();
      this.headBlock = head;
      const conf = BigInt(this.opts.confirmations);
      if (head < conf) {
        this.lastPollAt = Date.now();
        this.failures = 0;
        return;
      }
      const safeHead = head - conf + 1n;

      for (const sub of this.subscriptions.values()) {
        // ---- Reorg detection ----
        if (sub.tracker.size > 0) {
          const trackerSnapshot = sub.tracker.snapshot();
          const remote: Array<{ number: bigint; hash: Hex }> = [];
          for (const b of trackerSnapshot) {
            const live = await this.client.getBlock({ blockNumber: b.number });
            remote.push({ number: b.number, hash: live.hash as Hex });
          }
          const headBlock = sub.tracker.head();
          const tip = remote[remote.length - 1];
          if (headBlock && tip && tip.hash !== headBlock.hash) {
            const ancestor = sub.tracker.findCommonAncestor(remote);
            const rollbackFrom = ancestor
              ? ancestor.number + 1n
              : trackerSnapshot[0]!.number;
            const rollbackTo = sub.cursorState.lastBlock;
            const oldByNumber = new Map<bigint, Hex>();
            for (const b of trackerSnapshot) oldByNumber.set(b.number, b.hash);

            const rolledBack: DecodedEvent[] = [];
            for (let n = rollbackFrom; n <= rollbackTo; n++) {
              const oldHash = oldByNumber.get(n);
              if (!oldHash) continue;
              rolledBack.push({
                eventName: sub.event,
                args: {},
                address: sub.address,
                blockNumber: n,
                blockHash: oldHash,
                transactionHash:
                  "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex,
                transactionIndex: 0,
                logIndex: 0,
                topics: [sub.topic0],
                data: "0x" as Hex,
              });
            }
            if (rolledBack.length > 0 && sub.onReorg) await sub.onReorg(rolledBack);

            if (ancestor) {
              sub.tracker.truncateAfter(ancestor);
              sub.cursorState = {
                lastBlock: ancestor.number,
                recentBlocks: sub.tracker.snapshot(),
              };
            } else {
              sub.tracker.hydrate([]);
              sub.cursorState = {
                lastBlock: sub.fromBlock - 1n,
                recentBlocks: [],
              };
            }
            await this.cursor.save(sub.id, sub.cursorState);
          }
        }
        // ---- (existing) live emit ----
        if (sub.cursorState.lastBlock >= safeHead) continue;
        const fromBlock = sub.cursorState.lastBlock + 1n;
        const toBlock = safeHead;

        const logs = (await this.client.getLogs({
          address: sub.address,
          fromBlock,
          toBlock,
        })) as unknown as Array<{
          address: `0x${string}`;
          blockNumber: bigint;
          blockHash: Hex;
          transactionHash: Hex;
          transactionIndex: number;
          logIndex: number;
          topics: readonly Hex[];
          data: Hex;
        }>;

        for (const raw of logs) {
          if (raw.topics[0] !== sub.topic0) continue;
          const decoded = decodeOne(sub.abi, raw);
          await sub.onEvent(decoded);
        }

        // refresh recent block-hash window for the just-delivered range
        for (let n = fromBlock; n <= toBlock; n++) {
          if (n < 0n) continue;
          const block = await this.client.getBlock({ blockNumber: n });
          sub.tracker.push({ number: n, hash: block.hash as Hex });
        }
        sub.cursorState = {
          lastBlock: toBlock,
          recentBlocks: sub.tracker.snapshot(),
        };
        await this.cursor.save(sub.id, sub.cursorState);
      }

      this.lastPollAt = Date.now();
      this.failures = 0;
    } catch (e) {
      this.failures += 1;
      const delay = expBackoffWithJitter(this.failures);
      await new Promise((r) => setTimeout(r, delay));
      throw new NetworkError(
        `Indexer poll failed (attempt ${this.failures}): ${(e as Error).message}`,
        "Check the RPC URL and network connectivity; the indexer will retry."
      );
    }
  }

  private async callWithBackoff<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    for (;;) {
      try {
        return await fn();
      } catch (e) {
        attempt += 1;
        if (attempt > 5) throw e;
        await new Promise((r) => setTimeout(r, expBackoffWithJitter(attempt)));
      }
    }
  }
}
