// packages/0gkit-indexer/src/cursors/sqlite.ts
import Database, { type Database as DB } from "better-sqlite3";
import type { CursorState, CursorStore } from "../types.js";

export interface SqliteCursorStoreOptions {
  /** Path to the sqlite file. `:memory:` is supported. */
  path: string;
  /** Table name. Default "indexer_cursors". */
  table?: string;
}

/**
 * Persists cursor state in a sqlite database via `better-sqlite3`.
 *
 * `better-sqlite3` is synchronous and ~10x faster than node-sqlite for this
 * write-heavy / single-row-per-key workload. The whole CursorState is
 * serialised to JSON; bigints round-trip via a reviver that re-tags numeric
 * strings ending with the marker "n".
 */
export class SqliteCursorStore implements CursorStore {
  private readonly db: DB;
  private readonly tableName: string;

  constructor(opts: SqliteCursorStoreOptions) {
    this.db = new Database(opts.path);
    this.tableName = opts.table ?? "indexer_cursors";
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS "${this.tableName}" (
         subscription_id TEXT PRIMARY KEY,
         state           TEXT NOT NULL
       )`
    );
  }

  async load(subscriptionId: string): Promise<CursorState | null> {
    const row = this.db
      .prepare(`SELECT state FROM "${this.tableName}" WHERE subscription_id = ?`)
      .get(subscriptionId) as { state: string } | undefined;
    if (!row) return null;
    return deserialize(row.state);
  }

  async save(subscriptionId: string, state: CursorState): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO "${this.tableName}" (subscription_id, state)
         VALUES (?, ?)
         ON CONFLICT(subscription_id) DO UPDATE SET state = excluded.state`
      )
      .run(subscriptionId, serialize(state));
  }

  async close(): Promise<void> {
    this.db.close();
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
