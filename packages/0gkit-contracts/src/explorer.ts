import { ConfigError, getNetwork, type NetworkName } from "@foundryprotocol/0gkit-core";

export interface FetchAbiOptions {
  /** DI seam for tests — defaults to globalThis.fetch. */
  fetch?: typeof fetch;
  /**
   * Optional explorer API key. 0G ChainScan is keyless for read endpoints
   * ("use a placeholder if you don't have one" — 0G deploy docs); the key is
   * only appended when provided, e.g. to lift a future rate limit.
   */
  apiKey?: string;
}

/**
 * Fetch a **verified** contract ABI from the 0G ChainScan block explorer.
 *
 * 0G ChainScan exposes an Etherscan-compatible JSON API at `${explorer}/open/api`
 * (NOT `${explorer}/api`, which serves the explorer's SPA HTML). Verified on
 * both galileo (`chainscan-galileo.0g.ai`) and mainnet (`chainscan.0g.ai`):
 *
 *   GET /open/api?module=contract&action=getabi&address=0x…
 *     verified   → { status: "1", message: "OK",   result: "<json abi array>" }
 *     unverified → { status: "0", message: "NOTOK", result: "Contract source code not verified" }
 *
 * The `fetch` is injected so it is testable offline, and no behaviour is gated
 * on Aristotle being live (D10) — galileo is the default and works.
 *
 * @returns the parsed ABI as a bare array (as `getabi` returns it). Callers that
 *   feed this to the codegen must wrap it in a `{ abi }` artifact first.
 * @throws {ConfigError} for an explorer-less network, an HTTP error, an
 *   unverified contract, or a malformed ABI payload — never a fabricated ABI.
 */
export async function fetchExplorerAbi(
  address: string,
  network: NetworkName,
  opts: FetchAbiOptions = {}
): Promise<unknown[]> {
  const preset = getNetwork(network);
  if (!preset.explorer) {
    throw new ConfigError(
      `No block explorer is configured for network '${network}'.`,
      `Use --network galileo|aristotle, or pass --abi <path>.json instead.`
    );
  }
  const f = opts.fetch ?? globalThis.fetch;
  const params = new URLSearchParams({
    module: "contract",
    action: "getabi",
    address,
  });
  if (opts.apiKey) params.set("apikey", opts.apiKey);
  const url = `${preset.explorer}/open/api?${params.toString()}`;

  const res = await f(url, { method: "GET" });
  if (!res.ok) {
    throw new ConfigError(
      `Explorer ABI lookup failed (HTTP ${res.status}) for ${address}.`,
      `Verify the address + network, or pass --abi <path>.json instead.`
    );
  }
  const body = (await res.json()) as { status?: string; result?: string };
  if (body.status !== "1" || typeof body.result !== "string") {
    throw new ConfigError(
      `Contract ${address} is not verified on the ${network} explorer.`,
      `Pass the build artifact instead: 0g contracts import --abi <path>.json --name <Name>.`
    );
  }
  let abi: unknown;
  try {
    abi = JSON.parse(body.result);
  } catch {
    throw new ConfigError(
      `The ${network} explorer returned a malformed ABI for ${address}.`,
      `Pass --abi <path>.json with the verified artifact instead.`
    );
  }
  if (!Array.isArray(abi)) {
    throw new ConfigError(
      `The ${network} explorer returned a malformed ABI for ${address}.`,
      `Pass --abi <path>.json with the verified artifact instead.`
    );
  }
  return abi;
}
