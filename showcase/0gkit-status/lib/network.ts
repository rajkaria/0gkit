import { galileo } from "@foundryprotocol/0gkit-core";

export interface NetworkStatus {
  ok: boolean;
  network: string;
  chainId?: number;
  expectedChainId: number;
  latestBlock?: number;
  gasPriceGwei?: number;
  rpcUrl: string;
  explorer: string;
  error?: string;
  checkedAt: string;
}

async function rpc(url: string, method: string): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${method} → HTTP ${res.status}`);
  const json = (await res.json()) as { result?: string; error?: { message: string } };
  if (json.error) throw new Error(`${method} → ${json.error.message}`);
  if (typeof json.result !== "string") throw new Error(`${method} → no result`);
  return json.result;
}

/**
 * Reads real, live galileo network status over public JSON-RPC. No secrets
 * required. On any failure it returns `ok: false` with the error message —
 * the UI shows "no live data", never a fabricated number (honesty rule).
 */
export async function getNetworkStatus(): Promise<NetworkStatus> {
  const rpcUrl =
    process.env.OG_RPC_URL || galileo.rpcUrl || "https://evmrpc-testnet.0g.ai";
  const base = {
    network: galileo.name,
    expectedChainId: galileo.chainId ?? 16602,
    rpcUrl,
    explorer: galileo.explorer ?? "https://chainscan-galileo.0g.ai",
    checkedAt: new Date().toISOString(),
  };
  try {
    const [chainHex, blockHex, gasHex] = await Promise.all([
      rpc(rpcUrl, "eth_chainId"),
      rpc(rpcUrl, "eth_blockNumber"),
      rpc(rpcUrl, "eth_gasPrice").catch(() => "0x0"),
    ]);
    const gasWei = parseInt(gasHex, 16);
    return {
      ok: true,
      ...base,
      chainId: parseInt(chainHex, 16),
      latestBlock: parseInt(blockHex, 16),
      gasPriceGwei: gasWei ? Number((gasWei / 1e9).toFixed(4)) : undefined,
    };
  } catch (e) {
    return { ok: false, ...base, error: e instanceof Error ? e.message : String(e) };
  }
}
