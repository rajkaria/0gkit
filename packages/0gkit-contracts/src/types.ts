import type { Abi, Address, PublicClient, WalletClient } from "viem";
import type { Signer } from "@foundryprotocol/0gkit-core";

export type Network = "aristotle" | "galileo" | "local";

export interface BuildClientsOptions {
  /** Network preset (defaults to galileo). */
  network?: Network;
  /** Override the network's RPC URL. */
  rpcUrl?: string;
  /** When provided, enables the write path of `createTypedContract`. */
  signer?: Signer;
}

export interface TypedContractOptions<
  TAbi extends Abi = Abi,
> extends BuildClientsOptions {
  abi: TAbi;
  address: Address;
  /** Pre-built viem public client. When omitted, factory builds one from `network`/`rpcUrl`. */
  publicClient?: PublicClient;
  /** Pre-built viem wallet client. When omitted, factory builds one from `network`/`rpcUrl`/`signer`. */
  walletClient?: WalletClient;
}

export interface EventOptions {
  fromBlock?: bigint | "earliest" | "latest";
  toBlock?: bigint | "earliest" | "latest";
  /** Indexed arg filter, passed straight to viem.getLogs. */
  args?: Record<string, unknown>;
}
