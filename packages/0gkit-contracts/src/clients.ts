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
import { ConfigError, getNetwork } from "@foundryprotocol/0gkit-core";
import type { BuildClientsOptions } from "./types.js";

export interface BuiltClients {
  publicClient: PublicClient;
  walletClient?: WalletClient;
  chain: Chain;
}

/**
 * Build viem `PublicClient` (and `WalletClient` if a signer is provided) from a
 * network preset. Mirrors `0gkit-core.createClient` but takes a `Signer` rather
 * than a raw privateKey string so consumers don't have to plumb keys.
 *
 * Wallet-client construction currently requires a signer with an exposed
 * `privateKey` (the loaders `fromPrivateKey` / `fromFile` / `fromEnv` provide
 * it). KMS and wagmi signers expose only `signMessage` / `signTypedData` /
 * `sendTransaction`; for those, `walletClient` is left undefined and any
 * `.write.*` call from the typed-contract factory throws a CONFIG error with
 * a clear hint pointing users at `signer.sendTransaction` directly.
 */
export function buildClients(opts: BuildClientsOptions): BuiltClients {
  const networkName = opts.network ?? "galileo";
  const preset = getNetwork(networkName);
  const rpcUrl = opts.rpcUrl ?? preset.rpcUrl;
  const chainId = preset.chainId;
  if (!rpcUrl || !chainId) {
    throw new ConfigError(
      `Network '${networkName}' is missing ${!rpcUrl ? "rpcUrl" : "chainId"}.`,
      `Pass an explicit rpcUrl, or use a network whose preset is fully resolved (aristotle, galileo, local).`
    );
  }
  const chain = defineChain({
    id: chainId,
    name: preset.name,
    nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
    ...(preset.explorer
      ? { blockExplorers: { default: { name: "0G Explorer", url: preset.explorer } } }
      : {}),
  });
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain, transport });

  let walletClient: WalletClient | undefined;
  if (opts.signer?.privateKey) {
    const pk = opts.signer.privateKey;
    walletClient = createWalletClient({
      chain,
      transport,
      account: privateKeyToAccount(pk),
    });
  }
  return { publicClient, walletClient, chain };
}
