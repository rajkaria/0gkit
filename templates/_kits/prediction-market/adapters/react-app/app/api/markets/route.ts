/**
 * prediction-market — react-app adapter
 *
 * Next.js App Router route handler for prediction market operations.
 *
 * Routes:
 *   GET  /api/markets                  — list all markets
 *   POST /api/markets                  — open a new market
 *     Body: { "question": "...", "closesAt": <unix-ms> }
 *   GET  /api/markets?id=<id>          — get a single market
 *   POST /api/markets?action=bet       — place a bet
 *     Body: { "marketId": "...", "bettor": "...", "prediction": "...", "amount": <number> }
 *   POST /api/markets?action=resolve   — resolve a market via the ai-oracle
 *     Body: { "marketId": "..." }
 *
 * Composition wiring
 * ───────────────────
 * This kit COMPOSES ai-oracle. When both kits are applied, lib/oracle.ts and
 * lib/market.ts coexist in the project. This adapter imports resolveOracle
 * from the co-located oracle lib and wires the real oracle deps (infer,
 * attestor, anchor) the same way the ai-oracle react-app adapter does.
 *
 * Storage model
 * ──────────────
 * Uses the root-registry pattern from agent-memory: content-addressed 0G
 * Storage blobs keyed by namespace in the in-process registry. A production
 * deployment should persist the root map across restarts.
 *
 * Environment variables (set in .env.local):
 *   OG_PRIVATE_KEY        — 0x-prefixed private key
 *   OG_RPC_URL            — 0G chain RPC URL
 *   OG_COMPUTE_MODEL      — model override (optional)
 *   OG_ANCHOR_ONCHAIN     — "1" to use on-chain anchor (default: 0G Storage)
 *   OG_ANCHOR_ADDRESS     — deployed Anchor contract address (OG_ANCHOR_ONCHAIN=1)
 *   OG_STORAGE_NAMESPACE  — blob namespace prefix (default: "prediction-market")
 */

// NOTE: Adapters MAY import 0gkit packages.
import { Compute } from "@foundryprotocol/0gkit-compute";
import { Storage, type StorageConfig } from "@foundryprotocol/0gkit-storage";
import { digestJson } from "@foundryprotocol/0gkit-core";
import { fromPrivateKey } from "@foundryprotocol/0gkit-wallet";
import { recoverSigner } from "@foundryprotocol/0gkit-attestation";
import { createTypedContract } from "@foundryprotocol/0gkit-contracts";
import { NextRequest, NextResponse } from "next/server";

// Composed oracle lib — co-located when prediction-market is applied
// (ai-oracle is applied first by the composition engine, placing lib/oracle.ts)
import {
  resolveOracle,
  type Attestor,
  type Anchor,
  type OracleDeps,
} from "../../../lib/oracle.js";
import { ANCHOR_ABI } from "../../../lib/anchor-abi.js";
import {
  createMarketStore,
  openMarket,
  placeBet,
  resolveMarket,
  type MarketStorage,
} from "../../../lib/market.js";

// ---------------------------------------------------------------------------
// Root registry: namespace → latest 0G Storage root hash
// (mirrors agent-memory's in-process registry pattern)
// ---------------------------------------------------------------------------

const rootRegistry = new Map<string, string>();

// ---------------------------------------------------------------------------
// Singleton Storage instance
// ---------------------------------------------------------------------------

let _storage: Storage | undefined;

function getStorage(): Storage {
  if (!_storage) {
    const privateKey = process.env.OG_PRIVATE_KEY;
    const rpcUrl = process.env.OG_RPC_URL;
    if (!privateKey || !rpcUrl) {
      throw new Error("Missing OG_PRIVATE_KEY or OG_RPC_URL environment variables.");
    }
    const config: StorageConfig = { privateKey, rpcUrl };
    _storage = new Storage(config);
  }
  return _storage;
}

// ---------------------------------------------------------------------------
// MarketStorage adapter (content-addressed root-registry pattern)
// ---------------------------------------------------------------------------

function buildMarketStorageAdapter(): MarketStorage {
  const ns = process.env.OG_STORAGE_NAMESPACE ?? "prediction-market";
  const storage = getStorage();

  return {
    async putBlob(blobNs: string, data: string): Promise<void> {
      const key = `${ns}/${blobNs}`;
      const encoded = new TextEncoder().encode(data);
      const result = await storage.upload(encoded);
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
        return undefined;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Oracle deps (mirrors ai-oracle react-app adapter)
// ---------------------------------------------------------------------------

function getPrivateKey(): `0x${string}` {
  const key = process.env.OG_PRIVATE_KEY;
  if (!key) throw new Error("Missing OG_PRIVATE_KEY environment variable.");
  return key as `0x${string}`;
}

function getRpcUrl(): string {
  const rpc = process.env.OG_RPC_URL;
  if (!rpc) throw new Error("Missing OG_RPC_URL environment variable.");
  return rpc;
}

async function buildAttestor(privateKey: `0x${string}`): Promise<Attestor> {
  const signer = await fromPrivateKey(privateKey);
  return {
    async sign(receipt: unknown): Promise<{ digest: string; signature: string }> {
      const digest = digestJson(receipt);
      const signature = await signer.signMessage({ raw: digest });
      return { digest, signature };
    },
    async verify(
      receipt: unknown,
      signed: { digest: string; signature: string },
      expectedSigner: string
    ): Promise<{ ok: boolean; signer: string }> {
      const recomputed = digestJson(receipt);
      const digestMatch = recomputed.toLowerCase() === signed.digest.toLowerCase();
      const recovered = await recoverSigner({
        digest: signed.digest as `0x${string}`,
        signature: signed.signature as `0x${string}`,
      });
      return {
        ok: digestMatch && recovered.toLowerCase() === expectedSigner.toLowerCase(),
        signer: recovered,
      };
    },
  };
}

function buildStorageAnchor(storage: Storage): Anchor {
  return {
    async anchor(payload: Uint8Array | string): Promise<{ ref: string; kind: "storage" | "onchain" }> {
      const encoded = typeof payload === "string" ? new TextEncoder().encode(payload) : payload;
      const result = await storage.upload(encoded);
      return { ref: result.root, kind: "storage" };
    },
  };
}

async function buildOnchainAnchor(
  privateKey: `0x${string}`,
  rpcUrl: string,
  contractAddress: string
): Promise<Anchor> {
  const signer = await fromPrivateKey(privateKey);
  const contract = createTypedContract({
    address: contractAddress as `0x${string}`,
    abi: ANCHOR_ABI,
    signer,
    rpcUrl,
  });
  return {
    async anchor(payload: Uint8Array | string): Promise<{ ref: string; kind: "storage" | "onchain" }> {
      const text = typeof payload === "string" ? payload : new TextDecoder().decode(payload);
      const hash = digestJson({ payload: text });
      const tag = `prediction-market:${Date.now()}`;
      type AnchorWrite = (args: [`0x${string}`, string]) => Promise<{ txHash?: string }>;
      const anchorFn = (contract.write as Record<string, AnchorWrite>)["anchor"] as AnchorWrite;
      const writeResult = await anchorFn([hash, tag]);
      const txHash = writeResult.txHash ?? "unknown";
      return { ref: txHash, kind: "onchain" };
    },
  };
}

async function buildOracleDeps(): Promise<OracleDeps> {
  const privateKey = getPrivateKey();
  const rpcUrl = getRpcUrl();
  const signer = await fromPrivateKey(privateKey);
  const compute = new Compute({ signer });
  const inferClient = {
    async infer(args: { prompt: string; model?: string }) {
      const result = await compute.inference({
        messages: [{ role: "user" as const, content: args.prompt }],
        ...(args.model ? { model: args.model } : {}),
      });
      return { output: result.output };
    },
  };
  const attestor = await buildAttestor(privateKey);
  let anchor: Anchor;
  if (process.env.OG_ANCHOR_ONCHAIN === "1") {
    const anchorAddress = process.env.OG_ANCHOR_ADDRESS;
    if (!anchorAddress) {
      throw new Error("OG_ANCHOR_ADDRESS is required when OG_ANCHOR_ONCHAIN=1");
    }
    anchor = await buildOnchainAnchor(privateKey, rpcUrl, anchorAddress);
  } else {
    const storage = new Storage({ privateKey, rpcUrl });
    anchor = buildStorageAnchor(storage);
  }
  return {
    infer: inferClient,
    attestor,
    anchor,
    model: process.env.OG_COMPUTE_MODEL,
  };
}

// ---------------------------------------------------------------------------
// GET /api/markets (list all or get by ?id=<id>)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const id = request.nextUrl.searchParams.get("id");
    const marketStorage = buildMarketStorageAdapter();
    const store = createMarketStore(marketStorage);

    if (id) {
      const market = await store.getMarket(id);
      if (!market) {
        return NextResponse.json({ error: `Market not found: ${id}` }, { status: 404 });
      }
      return NextResponse.json({ market });
    }

    const markets = await store.listMarkets();
    return NextResponse.json({ markets });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/markets
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const action = request.nextUrl.searchParams.get("action");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const marketStorage = buildMarketStorageAdapter();
    const store = createMarketStore(marketStorage);

    // ---- open a new market ----
    if (!action) {
      const { question, closesAt } = body as { question?: unknown; closesAt?: unknown };
      if (typeof question !== "string" || !question) {
        return NextResponse.json({ error: '"question" must be a non-empty string' }, { status: 400 });
      }
      if (typeof closesAt !== "number") {
        return NextResponse.json({ error: '"closesAt" must be a Unix ms timestamp' }, { status: 400 });
      }
      const market = await openMarket(store, { question, closesAt });
      return NextResponse.json({ market }, { status: 201 });
    }

    // ---- place a bet ----
    if (action === "bet") {
      const { marketId, bettor, prediction, amount } = body as {
        marketId?: unknown; bettor?: unknown; prediction?: unknown; amount?: unknown;
      };
      if (typeof marketId !== "string" || !marketId) {
        return NextResponse.json({ error: '"marketId" is required' }, { status: 400 });
      }
      if (typeof bettor !== "string" || !bettor) {
        return NextResponse.json({ error: '"bettor" is required' }, { status: 400 });
      }
      if (typeof prediction !== "string" || !prediction) {
        return NextResponse.json({ error: '"prediction" is required' }, { status: 400 });
      }
      if (typeof amount !== "number" || amount <= 0) {
        return NextResponse.json({ error: '"amount" must be a positive number' }, { status: 400 });
      }
      const bet = await placeBet(store, { marketId, bettor, prediction, amount });
      return NextResponse.json({ bet }, { status: 201 });
    }

    // ---- resolve a market (via the composed ai-oracle) ----
    if (action === "resolve") {
      const { marketId } = body as { marketId?: unknown };
      if (typeof marketId !== "string" || !marketId) {
        return NextResponse.json({ error: '"marketId" is required' }, { status: 400 });
      }
      const oracleDeps = await buildOracleDeps();
      // Wrap resolveOracle so the market lib's resolveOracle(null, question) pattern works:
      // the adapter binds oracle deps via closure; market lib passes null as the deps argument.
      const boundResolveOracle = (_deps: unknown, question: string) =>
        resolveOracle(oracleDeps, question);
      const { market, receipt } = await resolveMarket(
        { resolveOracle: boundResolveOracle, storage: marketStorage },
        marketId
      );
      return NextResponse.json({ market, receipt });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
