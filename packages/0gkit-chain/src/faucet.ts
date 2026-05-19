import {
  ConfigError,
  NetworkError,
  type NetworkPreset,
  type Receipt,
} from "@foundryprotocol/0gkit-core";

/**
 * Request testnet funds. If the preset has a programmatic `faucetUrl`, POST
 * `{ address }` to it. Otherwise throw a ConfigError whose hint points the
 * user at the human faucet page (no silent failure, no guessed endpoint).
 */
export async function faucet(
  network: NetworkPreset,
  address: `0x${string}` | string
): Promise<Receipt> {
  if (!network.faucetUrl) {
    const where = network.faucetWebUrl
      ? `Visit ${network.faucetWebUrl} and request funds for ${address}.`
      : `No faucet is configured for '${network.name}'. See ` +
        `docs/superpowers/DECISIONS.md (D2) for the verified 0G faucet.`;
    throw new ConfigError(
      `No programmatic faucet endpoint for network '${network.name}'.`,
      where
    );
  }

  const startedAt = Date.now();
  let res: Response;
  try {
    res = await fetch(network.faucetUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new NetworkError(
      `Faucet request failed: ${msg}`,
      network.faucetWebUrl
        ? `Try the web faucet: ${network.faucetWebUrl}`
        : `Check connectivity and retry.`
    );
  }

  if (!res.ok) {
    throw new NetworkError(
      `Faucet returned HTTP ${res.status}.`,
      network.faucetWebUrl
        ? `Try the web faucet: ${network.faucetWebUrl}`
        : `Retry later; testnet faucets rate-limit per address/IP.`
    );
  }

  // JSON parse failure is intentionally swallowed; txHash will be undefined
  // — Receipt.txHash is optional by design (see @foundryprotocol/0gkit-core receipt.ts).
  const body = (await res.json().catch(() => ({}))) as { txHash?: string };
  return { txHash: body.txHash, latencyMs: Date.now() - startedAt };
}
