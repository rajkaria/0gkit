import { ConfigError } from "./errors.js";

export type NetworkName = "aristotle" | "galileo" | "local";

export interface NetworkPreset {
  /** Stable key. */
  readonly name: NetworkName;
  /** EVM chain id. `undefined` ⇒ createClient throws ConfigError. */
  readonly chainId?: number;
  /** EVM JSON-RPC URL. `undefined` ⇒ createClient throws ConfigError. */
  readonly rpcUrl?: string;
  /** Block-explorer base, NO trailing slash. `undefined` ⇒ explorerUrl() throws. */
  readonly explorer?: string;
  /** Programmatic faucet endpoint (testnet). `undefined` ⇒ faucet() throws. */
  readonly faucetUrl?: string;
  /** Human faucet page, surfaced in faucet()'s error hint. */
  readonly faucetWebUrl?: string;
  /** True for non-production networks. */
  readonly testnet: boolean;
}

// Aristotle: chain id + RPC are repo-proven (storage.ts DEFAULT_RPC,
// 0G-HACKATHON-INTEGRATION-PLAN.md). Explorer verified: docs.0g.ai/developer-hub/mainnet/mainnet-overview
export const aristotle: NetworkPreset = {
  name: "aristotle",
  chainId: 16661,
  rpcUrl: "https://evmrpc.0g.ai",
  explorer: "https://chainscan.0g.ai", // verified: https://docs.0g.ai/developer-hub/mainnet/mainnet-overview
  testnet: false,
};

// Galileo: testnet. All values verified from docs.0g.ai/developer-hub/testnet/testnet-overview
export const galileo: NetworkPreset = {
  name: "galileo",
  chainId: 16602, // verified: https://docs.0g.ai/developer-hub/testnet/testnet-overview
  rpcUrl: "https://evmrpc-testnet.0g.ai", // verified: https://docs.0g.ai/developer-hub/testnet/testnet-overview
  explorer: "https://chainscan-galileo.0g.ai", // verified: https://docs.0g.ai/developer-hub/testnet/testnet-overview
  faucetWebUrl: "https://faucet.0g.ai", // verified: https://docs.0g.ai/developer-hub/testnet/testnet-overview
  testnet: true,
};

// Local Anvil — documented standard defaults.
export const local: NetworkPreset = {
  name: "local",
  chainId: 31337,
  rpcUrl: "http://127.0.0.1:8545",
  testnet: true,
};

export const networks: Record<NetworkName, NetworkPreset> = {
  aristotle,
  galileo,
  local,
};

export function getNetwork(name: NetworkName): NetworkPreset {
  const preset = networks[name];
  // Defense for JS callers and future NetworkName additions made without updating `networks`.
  if (!preset) {
    throw new ConfigError(
      `Unknown network '${String(name)}'.`,
      `Use one of: ${Object.keys(networks).join(", ")}.`
    );
  }
  return preset;
}
