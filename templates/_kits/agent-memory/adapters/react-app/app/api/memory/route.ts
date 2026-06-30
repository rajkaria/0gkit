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
 * Environment variables required (set in .env.local):
 *   OG_PRIVATE_KEY          — 0x-prefixed private key
 *   OG_RPC_URL              — 0G chain RPC URL
 *   OG_STORAGE_NAMESPACE    — blob namespace prefix (default: "agent-memory")
 */

// NOTE: Adapters MAY import 0gkit packages.
import { Storage } from "@foundryprotocol/0gkit-storage";
import { Wallet, ethers } from "ethers";
import { NextRequest, NextResponse } from "next/server";

import {
  createMemory,
  type MemoryStorage,
  type MemoryEntry,
} from "../../../../../lib/agent-memory.js";

// ---------------------------------------------------------------------------
// Singleton storage (module-scoped, server-side only)
// ---------------------------------------------------------------------------

let _storage: Storage | undefined;

function getStorage(): Storage {
  if (!_storage) {
    const privateKey = process.env.OG_PRIVATE_KEY;
    const rpc = process.env.OG_RPC_URL;
    if (!privateKey || !rpc) {
      throw new Error(
        "Missing OG_PRIVATE_KEY or OG_RPC_URL environment variables. " +
          "See the agent-memory kit README for setup instructions."
      );
    }
    const provider = new ethers.JsonRpcProvider(rpc);
    const signer = new Wallet(privateKey, provider);
    _storage = new Storage(signer);
  }
  return _storage;
}

function buildStorageAdapter(): MemoryStorage {
  const ns = process.env.OG_STORAGE_NAMESPACE ?? "agent-memory";
  const storage = getStorage();
  return {
    async putBlob(blobNs: string, data: string): Promise<void> {
      const key = `${ns}/${blobNs}`;
      const encoded = new TextEncoder().encode(data);
      await storage.uploadFile(key, encoded);
    },
    async getBlob(blobNs: string): Promise<string | undefined> {
      const key = `${ns}/${blobNs}`;
      try {
        const bytes = await storage.downloadFile(key);
        if (!bytes) return undefined;
        return new TextDecoder().decode(bytes);
      } catch {
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
