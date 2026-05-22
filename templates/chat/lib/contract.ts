/**
 * Minimal ABI for the on-chain message registry. Two pieces:
 *
 *   event MessagePosted(address indexed author, bytes32 root, uint256 ts);
 *   function post(bytes32 root, uint256 ts) external;
 *
 * Deploy this with any Solidity toolchain (Foundry / Hardhat) at any address
 * you like and paste the address into `NEXT_PUBLIC_MESSAGE_REGISTRY_ADDRESS`.
 * The local devnet (`0g dev`) deploys this automatically.
 */
export const MESSAGE_REGISTRY_ABI = [
  {
    type: "event",
    name: "MessagePosted",
    inputs: [
      { name: "author", type: "address", indexed: true },
      { name: "root", type: "bytes32", indexed: false },
      { name: "ts", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "function",
    name: "post",
    stateMutability: "nonpayable",
    inputs: [
      { name: "root", type: "bytes32" },
      { name: "ts", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const MESSAGE_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_MESSAGE_REGISTRY_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;
