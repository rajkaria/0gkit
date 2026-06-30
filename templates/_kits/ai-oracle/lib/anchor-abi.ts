/**
 * Anchor.sol ABI — as const literal for createTypedContract inference.
 *
 * Keep in sync with contracts/Anchor.sol. The `as const` is required for
 * viem / createTypedContract to infer write method signatures at compile time.
 *
 * This file lives in `lib/` so it is included in the tiers overlay and
 * resolvable by all adapter imports as `../anchor-abi.js` (mcp-agent, tee)
 * or `../../lib/anchor-abi.js` relative to their src/routes, src/tools paths.
 */
export const ANCHOR_ABI = [
  {
    type: "function",
    name: "anchor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "hash", type: "bytes32" },
      { name: "tag", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "anchoredAt",
    stateMutability: "view",
    inputs: [{ name: "hash", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "Anchored",
    inputs: [
      { name: "hash", type: "bytes32", indexed: true },
      { name: "tag", type: "string", indexed: false },
      { name: "by", type: "address", indexed: true },
    ],
  },
] as const;

export type AnchorAbi = typeof ANCHOR_ABI;
