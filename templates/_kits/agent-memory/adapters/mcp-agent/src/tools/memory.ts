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
import { Storage } from "@foundryprotocol/0gkit-storage";
import { Wallet, ethers } from "ethers";

import {
  createMemory,
  type MemoryStorage,
} from "../../../../lib/agent-memory.js";

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
  /** 0G Storage contract address override (optional). */
  storageAddress?: string;
}

/** Minimal subset of the MCP Server interface needed to register tools. */
export interface McpServerLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool(name: string, description: string, schema: object, handler: (args: any) => Promise<any>): void;
}

// ---------------------------------------------------------------------------
// 0gkit-storage adapter — implements MemoryStorage
// ---------------------------------------------------------------------------

function buildStorageAdapter(storage: Storage, namespace: string): MemoryStorage {
  return {
    async putBlob(ns: string, data: string): Promise<void> {
      // Store the JSONL blob as a file in 0G Storage under `<namespace>/<ns>`
      const key = `${namespace}/${ns}`;
      const encoded = new TextEncoder().encode(data);
      await storage.uploadFile(key, encoded);
    },

    async getBlob(ns: string): Promise<string | undefined> {
      const key = `${namespace}/${ns}`;
      try {
        const bytes = await storage.downloadFile(key);
        if (!bytes) return undefined;
        return new TextDecoder().decode(bytes);
      } catch {
        // File not found — return undefined so createMemory treats it as empty
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
  const { privateKey, rpc, namespace = "agent-memory", storageAddress } = options;

  // Build the 0gkit Storage instance lazily (shared across tool calls)
  let _storage: Storage | undefined;

  function getStorage(): Storage {
    if (!_storage) {
      const provider = new ethers.JsonRpcProvider(rpc);
      const signer = new Wallet(privateKey, provider);
      _storage = new Storage(signer, storageAddress ? { address: storageAddress } : undefined);
    }
    return _storage;
  }

  function getMemory() {
    const storageAdapter = buildStorageAdapter(getStorage(), namespace);
    return createMemory({ storage: storageAdapter, namespace: "memories" });
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
      const lines = entries.map((e) => `${e.key}: ${e.value}`).join("\n");
      return {
        content: [{ type: "text", text: lines }],
      };
    },
  );
}
