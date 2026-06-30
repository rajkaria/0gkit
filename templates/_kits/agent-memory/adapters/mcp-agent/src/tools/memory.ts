/**
 * agent-memory — mcp-agent adapter
 *
 * Registers two MCP tools:
 *   memory_remember  — stores a key→value pair in agent memory
 *   memory_recall    — retrieves entries matching a query
 *
 * Wires @foundryprotocol/0gkit-storage to the MemoryStorage interface
 * expected by the portable lib core.
 *
 * Storage model: the JSONL blob for each namespace is uploaded as an immutable
 * 0G Storage object. The latest root hash is tracked in-process (survives tool
 * calls within the same process). A production deployment should persist the
 * root mapping (e.g. in a separate 0G blob or database) to survive restarts.
 *
 * Usage (in your MCP server entry point):
 *   import { registerMemoryTools } from "./src/tools/memory.js";
 *   registerMemoryTools(server, {
 *     privateKey: process.env.OG_PRIVATE_KEY!,
 *     rpc: process.env.OG_RPC_URL!,
 *     namespace: process.env.OG_STORAGE_NAMESPACE ?? "agent-memory",
 *   });
 */

// NOTE: Adapters MAY import 0gkit packages.
// The constraint (0gkit packages must NOT import @foundryprotocol/*) applies to
// the engine package only.
import { Storage, type StorageConfig } from "@foundryprotocol/0gkit-storage";

import {
  createMemory,
  type MemoryStorage,
} from "../../lib/agent-memory.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MemoryToolOptions {
  /** 0G chain private key (hex with 0x prefix). */
  privateKey: string;
  /** 0G chain JSON-RPC URL. */
  rpc: string;
  /** Namespace used as blob key in 0G Storage. Defaults to "agent-memory". */
  namespace?: string;
}

/** Minimal subset of the MCP Server interface needed to register tools. */
export interface McpServerLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool(name: string, description: string, schema: object, handler: (args: any) => Promise<any>): void;
}

// ---------------------------------------------------------------------------
// 0gkit-storage adapter — implements MemoryStorage
//
// 0G Storage is content-addressed: upload returns an immutable root hash and
// download retrieves by root. To provide a mutable key→blob interface, we keep
// an in-process map of namespace→latestRoot. Reads replay the blob via the
// latest root; writes append and upload a new blob, updating the root map.
// ---------------------------------------------------------------------------

function buildStorageAdapter(storage: Storage, namespacePrefix: string): MemoryStorage {
  // In-process root registry: namespace → latest 0G Storage root hash
  const rootRegistry = new Map<string, string>();

  return {
    async putBlob(ns: string, data: string): Promise<void> {
      const key = `${namespacePrefix}/${ns}`;
      const encoded = new TextEncoder().encode(data);
      const result = await storage.upload(encoded);
      // Track the new root so we can retrieve this exact blob later
      rootRegistry.set(key, result.root);
    },

    async getBlob(ns: string): Promise<string | undefined> {
      const key = `${namespacePrefix}/${ns}`;
      const root = rootRegistry.get(key);
      if (!root) return undefined;
      try {
        const bytes = await storage.download(root);
        return new TextDecoder().decode(bytes);
      } catch {
        // Root not found or network error — treat as empty
        return undefined;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerMemoryTools(
  server: McpServerLike,
  options: MemoryToolOptions,
): void {
  const { privateKey, rpc, namespace = "agent-memory" } = options;

  // Build the 0gkit Storage instance lazily (shared across tool calls)
  let _storage: Storage | undefined;

  function getStorage(): Storage {
    if (!_storage) {
      const config: StorageConfig = { privateKey, rpcUrl: rpc };
      _storage = new Storage(config);
    }
    return _storage;
  }

  // Build a single shared storage adapter (holds the in-process root registry)
  let _storageAdapter: MemoryStorage | undefined;

  function getMemory() {
    if (!_storageAdapter) {
      _storageAdapter = buildStorageAdapter(getStorage(), namespace);
    }
    return createMemory({ storage: _storageAdapter, namespace: "memories" });
  }

  // -------------------------------------------------------------------------
  // memory_remember
  // -------------------------------------------------------------------------

  server.tool(
    "memory_remember",
    "Store a key–value pair in the agent's persistent memory on 0G Storage. " +
      "If the key already exists the new value supersedes the old one (both are retained in the append log).",
    {
      type: "object",
      properties: {
        key: { type: "string", description: "Identifier for this memory (e.g. 'user-name', 'last-task')" },
        value: { type: "string", description: "Value to store" },
      },
      required: ["key", "value"],
    },
    async ({ key, value }: { key: string; value: string }) => {
      const mem = getMemory();
      await mem.remember(key, value);
      return {
        content: [{ type: "text", text: `Stored: ${key} = ${value}` }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // memory_recall
  // -------------------------------------------------------------------------

  server.tool(
    "memory_recall",
    "Recall agent memory entries whose key or value matches the query (case-insensitive substring). " +
      "Pass an empty query to retrieve all stored entries.",
    {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term (empty string to list all)" },
      },
      required: ["query"],
    },
    async ({ query }: { query: string }) => {
      const mem = getMemory();
      const entries = await mem.recall(query);
      if (entries.length === 0) {
        return {
          content: [{ type: "text", text: "No matching memory entries found." }],
        };
      }
      const lines = entries.map((e: { key: string; value: string }) => `${e.key}: ${e.value}`).join("\n");
      return {
        content: [{ type: "text", text: lines }],
      };
    },
  );
}
