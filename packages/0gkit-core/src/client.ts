import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Chain,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getNetwork, type NetworkName, type NetworkPreset } from "./networks.js";
import { ConfigError } from "./errors.js";

export interface CreateClientOptions {
  network: NetworkName;
  /** Overrides the preset RPC. Required if the preset has no rpcUrl. */
  rpcUrl?: string;
  /** Overrides the preset chain id. Required if the preset has no chainId. */
  chainId?: number;
  /**
   * Private key for signing. The leading `0x` is optional — it is added
   * automatically. When set, a wallet client is also returned.
   */
  privateKey?: string;
}

export interface ZeroGClient {
  network: NetworkPreset;
  public: PublicClient;
  wallet?: WalletClient;
}

/** Build a viem Chain from a preset (+ optional overrides). */
export function buildChain(
  preset: NetworkPreset,
  rpcUrl?: string,
  chainId?: number
): Chain {
  const url = rpcUrl ?? preset.rpcUrl;
  const id = chainId ?? preset.chainId;
  if (!url || !id) {
    throw new ConfigError(
      `Network '${preset.name}' has no ${!url ? "rpcUrl" : "chainId"} configured.`,
      `Pass { rpcUrl, chainId } to createClient, or use a network whose ` +
        `preset is fully resolved (aristotle, local). See docs/superpowers/DECISIONS.md (D2).`
    );
  }
  return defineChain({
    id,
    name: preset.name,
    nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
    rpcUrls: { default: { http: [url] } },
    ...(preset.explorer
      ? { blockExplorers: { default: { name: "0G Explorer", url: preset.explorer } } }
      : {}),
  });
}

export function createClient(opts: CreateClientOptions): ZeroGClient {
  const preset = getNetwork(opts.network);
  const chain = buildChain(preset, opts.rpcUrl, opts.chainId);
  const transport = http(chain.rpcUrls.default.http[0]);

  const publicClient = createPublicClient({ chain, transport });

  let wallet: WalletClient | undefined;
  if (opts.privateKey) {
    try {
      const pk = opts.privateKey.startsWith("0x")
        ? (opts.privateKey as `0x${string}`)
        : (`0x${opts.privateKey}` as `0x${string}`);
      wallet = createWalletClient({
        chain,
        transport,
        account: privateKeyToAccount(pk),
      });
    } catch {
      throw new ConfigError(
        "Invalid privateKey: must be a 32-byte hex string.",
        "Provide a 64-char hex private key (with or without 0x), e.g. the output of `cast wallet new`."
      );
    }
  }

  return { network: preset, public: publicClient, wallet };
}
