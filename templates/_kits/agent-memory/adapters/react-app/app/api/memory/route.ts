/**
 * agent-memory — react-app adapter
 *
 * Next.js App Router route handler for agent memory operations.
 *
 * GET  /api/memory?q=<query>   — recall entries matching query (all if omitted)
 * POST /api/memory             — remember a key→value pair
 *   Body: { "key": "...", "value": "..." }
 *
 * Wires @foundryprotocol/0gkit-storage to the MemoryStorage interface.
 *
 * Storage model: 0G Storage is content-addressed — upload() returns an immutable
 * root hash and download(root) retrieves by that hash. To provide mutable
 * namespace memory, we maintain an in-process root registry (namespace → latest
 * root). Reads replay via the latest root; writes append and upload a new blob,
 * updating the registry. A production deployment should persist the root mapping
 * across restarts (e.g. in a separate 0G blob or database).
 *
 * This is the same model the mcp-agent adapter uses — see
 * adapters/mcp-agent/src/tools/memory.ts for the reference implementation.
 *
 * Environment variables required (set in .env.local):
 *   OG_PRIVATE_KEY          — 0x-prefixed private key
 *   OG_RPC_URL              — 0G chain RPC URL
 *   OG_STORAGE_NAMESPACE    — blob namespace prefix (default: "agent-memory")
 */

// NOTE: Adapters MAY import 0gkit packages.
import { Storage, type StorageConfig } from "@foundryprotocol/0gkit-storage";
import { NextRequest, NextResponse } from "next/server";

import {
  createMemory,
  type MemoryStorage,
  type MemoryEntry,
} from "../../../lib/agent-memory.js";

// ---------------------------------------------------------------------------
// In-process root registry: namespace → latest 0G Storage root hash
//
// Lives at module scope so it survives multiple requests within the same
// Next.js server process. Does NOT survive a cold-start — add a persistent
// store (another 0G blob keyed by a well-known root, or a database) if you
// need restart durability.
// ---------------------------------------------------------------------------

const rootRegistry = new Map<string, string>();

// ---------------------------------------------------------------------------
// Singleton Storage instance (module-scoped, server-side only)
// ---------------------------------------------------------------------------

let _storage: Storage | undefined;

function getStorage(): Storage {
  if (!_storage) {
    const privateKey = process.env.OG_PRIVATE_KEY;
    const rpcUrl = process.env.OG_RPC_URL;
    if (!privateKey || !rpcUrl) {
      throw new Error(
        "Missing OG_PRIVATE_KEY or OG_RPC_URL environment variables. " +
          "See the agent-memory kit README for setup instructions."
      );
    }
    const config: StorageConfig = { privateKey, rpcUrl };
    _storage = new Storage(config);
  }
  return _storage;
}

// ---------------------------------------------------------------------------
// Content-addressed MemoryStorage adapter (mirrors mcp-agent adapter)
// ---------------------------------------------------------------------------

function buildStorageAdapter(): MemoryStorage {
  const ns = process.env.OG_STORAGE_NAMESPACE ?? "agent-memory";
  const storage = getStorage();

  return {
    async putBlob(blobNs: string, data: string): Promise<void> {
      const key = `${ns}/${blobNs}`;
      const encoded = new TextEncoder().encode(data);
      const result = await storage.upload(encoded);
      // Track the new root so we can retrieve this exact blob later
      rootRegistry.set(key, result.root);
    },

    async getBlob(blobNs: string): Promise<string | undefined> {
      const key = `${ns}/${blobNs}`;
      const root = rootRegistry.get(key);
      if (!root) return undefined;
      try {
        const bytes = await storage.download(root);
        if (!bytes) return undefined;
        return new TextDecoder().decode(bytes);
      } catch {
        // Root not found or network error — treat as empty
        return undefined;
      }
    },
  };
}

function getMemory() {
  return createMemory({ storage: buildStorageAdapter(), namespace: "memories" });
}

// ---------------------------------------------------------------------------
// GET /api/memory?q=<query>
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const query = request.nextUrl.searchParams.get("q") ?? "";
    const mem = getMemory();
    const entries: MemoryEntry[] = await mem.recall(query);
    return NextResponse.json({ entries });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/memory
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { key, value } = body as { key?: unknown; value?: unknown };
    if (typeof key !== "string" || !key) {
      return NextResponse.json(
        { error: '"key" must be a non-empty string' },
        { status: 400 }
      );
    }
    if (typeof value !== "string") {
      return NextResponse.json({ error: '"value" must be a string' }, { status: 400 });
    }

    const mem = getMemory();
    await mem.remember(key, value);
    return NextResponse.json({ ok: true, key, value });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
