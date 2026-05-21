import type { Address } from "viem";
import type { Signer } from "@foundryprotocol/0gkit-core";
import { ConfigError } from "@foundryprotocol/0gkit-core";
import { createTypedContract, type TypedContract } from "../factory.js";
import type { Network } from "../types.js";
import { KNOWN_ADDRESSES } from "./addresses.js";

/**
 * Provider registry — the on-chain directory of 0G service providers
 * (storage / compute nodes, their endpoints, stake, and active status).
 *
 * The ABI shape below tracks the public surface 0G is converging on; once
 * 0G publishes the canonical deployment, the address is added to
 * `KNOWN_ADDRESSES.registry[network]` and this factory stops requiring an
 * explicit `{ address }`. Until then we throw a clear CONFIG error rather
 * than fabricate an address — per the honesty rule in CLAUDE.md.
 */
export const RegistryAbi = [
  {
    type: "function",
    name: "getProvider",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "operator", type: "address" },
          { name: "url", type: "string" },
          { name: "stake", type: "uint256" },
          { name: "active", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "listProviders",
    stateMutability: "view",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [{ type: "bytes32[]" }],
  },
  {
    type: "function",
    name: "registerProvider",
    stateMutability: "payable",
    inputs: [
      { name: "url", type: "string" },
      { name: "stake", type: "uint256" },
    ],
    outputs: [{ name: "id", type: "bytes32" }],
  },
  {
    type: "function",
    name: "deactivateProvider",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "event",
    name: "ProviderRegistered",
    inputs: [
      { indexed: true, name: "id", type: "bytes32" },
      { indexed: true, name: "operator", type: "address" },
      { indexed: false, name: "url", type: "string" },
      { indexed: false, name: "stake", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "ProviderDeactivated",
    inputs: [
      { indexed: true, name: "id", type: "bytes32" },
      { indexed: true, name: "operator", type: "address" },
    ],
  },
] as const;

export interface RegistryOptions {
  /** Override the canonical registry deployment for a custom one. */
  address?: Address;
  network?: Network;
  rpcUrl?: string;
  signer?: Signer;
}

export function registry(
  opts: RegistryOptions = {}
): TypedContract<typeof RegistryAbi> {
  const network = opts.network ?? "galileo";
  const pinned = KNOWN_ADDRESSES.registry[network];
  const address = opts.address ?? pinned;
  if (!address) {
    throw new ConfigError(
      `0G provider registry has no pinned address for network='${network}'.`,
      `0G has not yet published the canonical registry deployment. Pass { address } explicitly when you have one, or follow https://docs.0g.ai for the rollout. The ABI shape is stable and available as \`RegistryAbi\`.`
    );
  }
  return createTypedContract({
    abi: RegistryAbi,
    address,
    network,
    rpcUrl: opts.rpcUrl,
    signer: opts.signer,
  });
}
