/**
 * agent-memory — portable core
 *
 * Dependency-free: accepts an injected MemoryStorage so the lib works on every
 * base and is fully unit-testable with a mock. Adapters (mcp-agent, react-app)
 * wire the real @foundryprotocol/0gkit-storage to this interface.
 *
 * Storage model: one JSONL blob per namespace, appended on every `remember`.
 * `recall(query)` and `list()` parse the blob on each read and do in-memory
 * keyword filtering — suitable for agent-scale workloads (thousands of entries).
 */

// ---------------------------------------------------------------------------
// Storage interface (injected by adapters / tests)
// ---------------------------------------------------------------------------

/** Minimal interface that adapters must satisfy. */
export interface MemoryStorage {
  /**
   * Overwrite the blob at `ns` with `data`.
   * If the key does not exist it should be created.
   */
  putBlob(ns: string, data: string): Promise<void>;

  /**
   * Fetch the current blob at `ns`.
   * Returns `undefined` when the key does not exist yet.
   */
  getBlob(ns: string): Promise<string | undefined>;
}

// ---------------------------------------------------------------------------
// Memory entry
// ---------------------------------------------------------------------------

export interface MemoryEntry {
  key: string;
  value: string;
  ts: number; // Unix ms
}

// ---------------------------------------------------------------------------
// createMemory
// ---------------------------------------------------------------------------

export interface MemoryOptions {
  /** Injected storage implementation. */
  storage: MemoryStorage;
  /**
   * Namespace (used as the blob key in storage).
   * Defaults to "default".
   */
  namespace?: string;
}

export interface AgentMemory {
  /**
   * Append a key→value pair to memory.
   * If `key` already exists the old entry is superseded but retained in the
   * log; `recall` returns the latest entry for each key.
   */
  remember(key: string, value: string): Promise<void>;

  /**
   * Recall entries whose key or value contains `query` (case-insensitive
   * substring match).  Returns at most one entry per key (the most recent).
   *
   * Passing an empty string returns all entries (same as `list()`).
   */
  recall(query: string): Promise<MemoryEntry[]>;

  /** Return the most recent entry for every known key. */
  list(): Promise<MemoryEntry[]>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseBlob(raw: string | undefined): MemoryEntry[] {
  if (!raw || raw.trim() === "") return [];
  const entries: MemoryEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed) as MemoryEntry;
      if (
        typeof entry.key === "string" &&
        typeof entry.value === "string" &&
        typeof entry.ts === "number"
      ) {
        entries.push(entry);
      }
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

/**
 * Deduplicate: keep only the latest entry per key (last-write wins).
 */
function deduplicate(entries: MemoryEntry[]): MemoryEntry[] {
  const map = new Map<string, MemoryEntry>();
  for (const entry of entries) {
    map.set(entry.key, entry);
  }
  return Array.from(map.values());
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMemory({
  storage,
  namespace = "default",
}: MemoryOptions): AgentMemory {
  async function readEntries(): Promise<MemoryEntry[]> {
    const raw = await storage.getBlob(namespace);
    return parseBlob(raw);
  }

  async function remember(key: string, value: string): Promise<void> {
    const existing = await storage.getBlob(namespace);
    const line = JSON.stringify({ key, value, ts: Date.now() } satisfies MemoryEntry);
    const updated = existing && existing.trim() !== "" ? `${existing}\n${line}` : line;
    await storage.putBlob(namespace, updated);
  }

  async function list(): Promise<MemoryEntry[]> {
    const all = await readEntries();
    return deduplicate(all);
  }

  async function recall(query: string): Promise<MemoryEntry[]> {
    const latest = await list();
    if (!query) return latest;
    const q = query.toLowerCase();
    return latest.filter(
      (e) => e.key.toLowerCase().includes(q) || e.value.toLowerCase().includes(q)
    );
  }

  return { remember, recall, list };
}
