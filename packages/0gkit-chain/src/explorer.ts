import {
  ConfigError,
  type NetworkPreset,
  type Receipt,
} from "@foundryprotocol/0gkit-core";

export type ExplorerTarget = { tx: string } | { address: string };

/** Build a block-explorer URL. Throws ConfigError if the network has none. */
export function explorerUrl(network: NetworkPreset, target: ExplorerTarget): string {
  if (!network.explorer) {
    throw new ConfigError(
      `Network '${network.name}' has no block explorer configured.`,
      `Pass an explorer base in the network preset, or omit explorer links. ` +
        `See docs/superpowers/DECISIONS.md (D2) for verified 0G explorer bases.`
    );
  }
  const base = network.explorer.replace(/\/+$/, "");
  if ("tx" in target) return `${base}/tx/${target.tx}`;
  return `${base}/address/${target.address}`;
}

/**
 * Returns a copy of `receipt` with `explorerUrl` filled from `receipt.txHash`
 * when the network has an explorer. No-op (returns the receipt unchanged-shaped)
 * when there is no explorer or no txHash. Never throws.
 */
export function attachExplorerUrl(receipt: Receipt, network: NetworkPreset): Receipt {
  if (!network.explorer || !receipt.txHash) return receipt;
  return {
    ...receipt,
    explorerUrl: explorerUrl(network, { tx: String(receipt.txHash) }),
  };
}
