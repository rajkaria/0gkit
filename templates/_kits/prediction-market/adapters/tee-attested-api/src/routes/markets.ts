/**
 * prediction-market — tee-attested-api adapter
 *
 * Hono router mounted under /markets.
 *
 * Routes:
 *   GET  /markets             — list all markets
 *   GET  /markets/:id         — get a single market
 *   POST /markets             — open a new market
 *     Body: { "question": "...", "closesAt": <unix-ms> }
 *   POST /markets/:id/bet     — place a bet
 *     Body: { "bettor": "...", "prediction": "...", "amount": <number> }
 *   POST /markets/:id/resolve — resolve via the composed ai-oracle
 *
 * Composition wiring
 * ───────────────────
 * This kit COMPOSES ai-oracle. When applied, the engine writes lib/oracle.ts
 * (from ai-oracle) and lib/market.ts into the project. This adapter imports
 * resolveOracle from the co-located oracle lib and wires the real oracle deps
 * (infer, attestor, anchor) exactly as the ai-oracle tee-attested-api adapter
 * does.
 *
 * Storage model
 * ──────────────
 * Root-registry pattern: content-addressed 0G Storage blobs, namespace-keyed
 * in an in-process registry. No Indexer — market data uses blob storage only.
 *
 * Environment variables:
 *   OG_PRIVATE_KEY        — 0x-prefixed private key
 *   OG_RPC_URL            — 0G chain RPC URL
 *   OG_COMPUTE_MODEL      — model override (optional)
 *   OG_ANCHOR_ONCHAIN     — "1" to use on-chain anchor (default: 0G Storage)
 *   OG_ANCHOR_ADDRESS     — deployed Anchor contract address (OG_ANCHOR_ONCHAIN=1)
 *   OG_STORAGE_NAMESPACE  — blob namespace prefix (default: "prediction-market")
 */

// NOTE: Adapters MAY import 0gkit packages.
import { Hono } from "hono";
import { Compute } from "@foundryprotocol/0gkit-compute";
import { Storage, type StorageConfig } from "@foundryprotocol/0gkit-storage";
import { digestJson } from "@foundryprotocol/0gkit-core";
import { fromPrivateKey } from "@foundryprotocol/0gkit-wallet";
import { recoverSigner } from "@foundryprotocol/0gkit-attestation";
import { createTypedContract } from "@foundryprotocol/0gkit-contracts";

// Composed oracle lib — co-located when prediction-market is applied
import {
  resolveOracle,
  type Attestor,
  type Anchor,
  type OracleDeps,
} from "../../lib/oracle.js";
import { ANCHOR_ABI } from "../../lib/anchor-abi.js";
import {
  createMarketStore,
  openMarket,
  placeBet,
  resolveMarket,
  type MarketStorage,
} from "../../lib/market.js";

// ---------------------------------------------------------------------------
// Root registry (mirrors agent-memory pattern)
// ---------------------------------------------------------------------------

const rootRegistry = new Map<string, string>();

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
// Oracle deps (mirrors ai-oracle tee-attested-api adapter)
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
    async anchor(
      payload: Uint8Array | string
    ): Promise<{ ref: string; kind: "storage" | "onchain" }> {
      const encoded =
        typeof payload === "string" ? new TextEncoder().encode(payload) : payload;
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
    async anchor(
      payload: Uint8Array | string
    ): Promise<{ ref: string; kind: "storage" | "onchain" }> {
      const text =
        typeof payload === "string" ? payload : new TextDecoder().decode(payload);
      const hash = digestJson({ payload: text });
      const tag = `prediction-market:${Date.now()}`;
      type AnchorWrite = (
        args: [`0x${string}`, string]
      ) => Promise<{ txHash?: string }>;
      const anchorFn = (contract.write as Record<string, AnchorWrite>)[
        "anchor"
      ] as AnchorWrite;
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
// Router
// ---------------------------------------------------------------------------

export function buildMarketsRouter(): Hono {
  const router = new Hono();

  // GET /markets — list all markets
  router.get("/", async (c) => {
    try {
      const marketStorage = buildMarketStorageAdapter();
      const store = createMarketStore(marketStorage);
      const markets = await store.listMarkets();
      return c.json({ markets });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  // GET /markets/:id — get a single market
  router.get("/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const marketStorage = buildMarketStorageAdapter();
      const store = createMarketStore(marketStorage);
      const market = await store.getMarket(id);
      if (!market) {
        return c.json({ error: `Market not found: ${id}` }, 404);
      }
      return c.json({ market });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  // POST /markets — open a new market
  router.post("/", async (c) => {
    let body: { question?: string; closesAt?: number };
    try {
      body = (await c.req.json()) as { question?: string; closesAt?: number };
    } catch {
      return c.json({ error: "invalid json" }, 400);
    }
    if (!body.question || typeof body.question !== "string") {
      return c.json({ error: "missing or invalid question" }, 400);
    }
    if (typeof body.closesAt !== "number") {
      return c.json({ error: '"closesAt" must be a Unix ms timestamp' }, 400);
    }
    try {
      const marketStorage = buildMarketStorageAdapter();
      const store = createMarketStore(marketStorage);
      const market = await openMarket(store, {
        question: body.question,
        closesAt: body.closesAt,
      });
      return c.json({ market }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  // POST /markets/:id/bet — place a bet
  router.post("/:id/bet", async (c) => {
    const marketId = c.req.param("id");
    let body: { bettor?: string; prediction?: string; amount?: number };
    try {
      body = (await c.req.json()) as {
        bettor?: string;
        prediction?: string;
        amount?: number;
      };
    } catch {
      return c.json({ error: "invalid json" }, 400);
    }
    if (!body.bettor || typeof body.bettor !== "string") {
      return c.json({ error: "missing or invalid bettor" }, 400);
    }
    if (!body.prediction || typeof body.prediction !== "string") {
      return c.json({ error: "missing or invalid prediction" }, 400);
    }
    if (typeof body.amount !== "number" || body.amount <= 0) {
      return c.json({ error: '"amount" must be a positive number' }, 400);
    }
    try {
      const marketStorage = buildMarketStorageAdapter();
      const store = createMarketStore(marketStorage);
      const bet = await placeBet(store, {
        marketId,
        bettor: body.bettor,
        prediction: body.prediction,
        amount: body.amount,
      });
      return c.json({ bet }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  // POST /markets/:id/resolve — resolve via composed ai-oracle
  router.post("/:id/resolve", async (c) => {
    const marketId = c.req.param("id");
    try {
      const marketStorage = buildMarketStorageAdapter();
      const oracleDeps = await buildOracleDeps();
      // Bind oracle deps via closure; market lib passes null as deps arg
      const boundResolveOracle = (_deps: unknown, question: string) =>
        resolveOracle(oracleDeps, question);
      const { market, receipt } = await resolveMarket(
        { resolveOracle: boundResolveOracle, storage: marketStorage },
        marketId
      );
      return c.json({ market, receipt });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  return router;
}
