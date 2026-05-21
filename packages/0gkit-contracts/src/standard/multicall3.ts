import type { Address } from "viem";
import type { Signer } from "@foundryprotocol/0gkit-core";
import { createTypedContract, type TypedContract } from "../factory.js";
import type { Network } from "../types.js";
import { KNOWN_ADDRESSES } from "./addresses.js";

/**
 * Minimal Multicall3 ABI — the standard universal contract deployed at
 * `0xcA11bde05977b3631167028862bE2a173976CA11` on every EVM chain. See
 * https://multicall3.com for the full reference.
 */
export const Multicall3Abi = [
  {
    type: "function",
    name: "aggregate",
    stateMutability: "payable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "callData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      { name: "blockNumber", type: "uint256" },
      { name: "returnData", type: "bytes[]" },
    ],
  },
  {
    type: "function",
    name: "aggregate3",
    stateMutability: "payable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "callData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      {
        name: "returnData",
        type: "tuple[]",
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "blockAndAggregate",
    stateMutability: "payable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "callData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      { name: "blockNumber", type: "uint256" },
      { name: "blockHash", type: "bytes32" },
      {
        name: "returnData",
        type: "tuple[]",
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getBlockNumber",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "blockNumber", type: "uint256" }],
  },
  {
    type: "function",
    name: "getCurrentBlockTimestamp",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "timestamp", type: "uint256" }],
  },
  {
    type: "function",
    name: "getEthBalance",
    stateMutability: "view",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
] as const;

export interface Multicall3Options {
  /** Override the universal Multicall3 address (rarely needed). */
  address?: Address;
  network?: Network;
  rpcUrl?: string;
  signer?: Signer;
}

export function multicall3(
  opts: Multicall3Options = {}
): TypedContract<typeof Multicall3Abi> {
  const network = opts.network ?? "galileo";
  const address = opts.address ?? KNOWN_ADDRESSES.multicall3[network];
  return createTypedContract({
    abi: Multicall3Abi,
    address,
    network,
    rpcUrl: opts.rpcUrl,
    signer: opts.signer,
  });
}
