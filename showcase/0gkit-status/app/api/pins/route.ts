import { NextResponse } from "next/server";
import { createMemory, type MemoryStorage } from "@/lib/agent-memory";

// --- agent-memory kit, composed into this app ------------------------------
// Pins are stored through the kit's portable `createMemory()` API. Backend:
//   • OG_PRIVATE_KEY set → 0G Storage (published @foundryprotocol/0gkit-storage)
//   • otherwise          → in-process (honest: not durable across cold starts)
// The kit lib is exercised either way — this is the dogfood.

export const dynamic = "force-dynamic";
const NS = "0gkit-status:pins";

// In-process fallback storage (module-scoped; resets on cold start).
const memBlobs = new Map<string, string>();
const inMemoryStorage: MemoryStorage = {
  async putBlob(ns, data) {
    memBlobs.set(ns, data);
  },
  async getBlob(ns) {
    return memBlobs.get(ns);
  },
};

// 0G-Storage-backed bridge (lazy — only loads the heavy package when keyed).
const roots = new Map<string, string>();
async function storageBacked(): Promise<MemoryStorage | null> {
  const privateKey = process.env.OG_PRIVATE_KEY;
  if (!privateKey) return null;
  const { Storage } = await import("@foundryprotocol/0gkit-storage");
  const storage = new Storage({
    privateKey: privateKey as `0x${string}`,
    rpcUrl: process.env.OG_RPC_URL || "https://evmrpc-testnet.0g.ai",
  });
  return {
    async putBlob(ns, data) {
      const { root } = await storage.upload(new TextEncoder().encode(data));
      roots.set(ns, root);
    },
    async getBlob(ns) {
      const root = roots.get(ns);
      if (!root) return undefined;
      const bytes = await storage.download(root);
      return bytes ? new TextDecoder().decode(bytes) : undefined;
    },
  };
}

async function getMemory() {
  const backed = await storageBacked();
  const persisted = backed !== null;
  const memory = createMemory({
    storage: backed ?? inMemoryStorage,
    namespace: NS,
  });
  return { memory, persisted };
}

export async function GET() {
  try {
    const { memory, persisted } = await getMemory();
    const entries = await memory.list();
    return NextResponse.json({ ok: true, persisted, entries });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { key?: string; value?: string };
    if (!body.value) {
      return NextResponse.json(
        { ok: false, error: "value is required" },
        { status: 400 }
      );
    }
    const { memory, persisted } = await getMemory();
    await memory.remember(body.key || `pin:${Date.now()}`, body.value);
    const entries = await memory.list();
    return NextResponse.json({ ok: true, persisted, entries });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
