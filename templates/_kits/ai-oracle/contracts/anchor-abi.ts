/**
 * Re-exports from the canonical lib/anchor-abi.ts.
 *
 * lib/anchor-abi.ts is the single source of truth — adapters import from there.
 * This file exists only for scripts/tooling that reference contracts/ directly
 * (e.g. forge codegen helpers). Do NOT duplicate the ABI here.
 */
export { ANCHOR_ABI, type AnchorAbi } from "../lib/anchor-abi.js";
