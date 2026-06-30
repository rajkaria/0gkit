/**
 * Inft.sol ABI — as const literal for createTypedContract inference.
 *
 * Keep in sync with contracts/Inft.sol. The `as const` is required for
 * viem / createTypedContract to infer write method signatures at compile time.
 *
 * This file lives in `lib/` (tier file) so it is included in the tiers overlay
 * and resolvable by all adapters as `../../lib/inft-abi.js` (relative to
 * adapters/react-app/app/api/inft/route.ts).
 *
 * IMPORTANT: Erc721Abi (from @foundryprotocol/0gkit-contracts) is the STANDARD
 * ERC-721 ABI and has NO mint function. This ABI covers the INFT contract which
 * EXTENDS ERC-721 with a mintable surface. Wire createTypedContract with INFT_ABI
 * for minting; wire standardContracts.erc721 / Erc721Abi for read operations
 * (ownerOf, tokenURI, balanceOf) if needed.
 */

export const INFT_ABI = [
  // ──────────────────────────────────────────
  // Mint (added by Inft.sol — NOT in ERC-721)
  // ──────────────────────────────────────────
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "metadataRoot", type: "bytes32" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  // ──────────────────────────────────────────
  // ERC-721 read surface
  // ──────────────────────────────────────────
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  // ──────────────────────────────────────────
  // Events
  // ──────────────────────────────────────────
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
    ],
  },
  {
    type: "event",
    name: "Minted",
    inputs: [
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "metadataRoot", type: "bytes32", indexed: false },
      { name: "provenanceHash", type: "bytes32", indexed: false },
    ],
  },
] as const;

export type InftAbi = typeof INFT_ABI;
