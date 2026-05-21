// packages/0gkit-indexer/src/cursors/redis.ts
import type { Redis as RedisClient, RedisOptions } from "ioredis";
import type { CursorState, CursorStore } from "../types.js";

export interface RedisCursorStoreOptions {
  /** Either a redis URL string or an existing ioredis client. */
  url?: string;
  client?: RedisClient;
  redisOptions?: RedisOptions;
  /** Key prefix. Default "0gkit:indexer". */
  namespace?: string;
}

/**
 * Persists cursor state in Redis. `ioredis` is an optional peer; we lazy-import it.
 *
 * Keys: `<namespace>:cursor:<subscriptionId>`. State serialised as bigint-safe JSON.
 */
export class RedisCursorStore implements CursorStore {
  private readonly clientPromise: Promise<RedisClient>;
  private readonly ownsClient: boolean;
  private readonly namespace: string;

  constructor(opts: RedisCursorStoreOptions) {
    this.namespace = opts.namespace ?? "0gkit:indexer";
    if (opts.client) {
      this.clientPromise = Promise.resolve(opts.client);
      this.ownsClient = false;
    } else if (opts.url) {
      this.ownsClient = true;
      this.clientPromise = import("ioredis").then(
        (m) => new m.default(opts.url!, opts.redisOptions ?? {})
      );
    } else {
      throw new Error(
        "RedisCursorStore: pass { client } or { url } to construct the store."
      );
    }
  }

  private key(subscriptionId: string): string {
    return `${this.namespace}:cursor:${subscriptionId}`;
  }

  async load(subscriptionId: string): Promise<CursorState | null> {
    const c = await this.clientPromise;
    const raw = await c.get(this.key(subscriptionId));
    return raw ? deserialize(raw) : null;
  }

  async save(subscriptionId: string, state: CursorState): Promise<void> {
    const c = await this.clientPromise;
    await c.set(this.key(subscriptionId), serialize(state));
  }

  async close(): Promise<void> {
    if (this.ownsClient) {
      const c = await this.clientPromise;
      await c.quit();
    }
  }
}

function serialize(state: CursorState): string {
  return JSON.stringify(state, (_k, v) =>
    typeof v === "bigint" ? `${v.toString()}n` : v
  );
}

function deserialize(raw: string): CursorState {
  return JSON.parse(raw, (_k, v) => {
    if (typeof v === "string" && /^-?\d+n$/.test(v)) {
      return BigInt(v.slice(0, -1));
    }
    return v;
  }) as CursorState;
}
