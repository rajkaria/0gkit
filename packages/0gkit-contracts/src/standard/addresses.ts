import type { Network } from "../types.js";

/**
 * Per-network addresses for the bundled standard contracts.
 *
 * Honesty rule: we only set an address when it's published and verifiable.
 * Multicall3 is universal (same address across every EVM chain).
 * `registry` and `attestationVerifier` are intentionally `null` until 0G
 * publishes a canonical deployment — the factories surface a CONFIG error
 * telling users exactly that, so no fabricated address ever ships.
 */
export const KNOWN_ADDRESSES: {
  multicall3: Record<Network, `0x${string}`>;
  registry: Record<Network, `0x${string}` | null>;
  attestationVerifier: Record<Network, `0x${string}` | null>;
} = {
  multicall3: {
    // Multicall3 is deployed at the same address on every EVM chain. See https://multicall3.com.
    aristotle: "0xcA11bde05977b3631167028862bE2a173976CA11",
    galileo: "0xcA11bde05977b3631167028862bE2a173976CA11",
    local: "0xcA11bde05977b3631167028862bE2a173976CA11",
  },
  registry: {
    aristotle: null,
    galileo: null,
    local: null,
  },
  attestationVerifier: {
    aristotle: null,
    galileo: null,
    local: null,
  },
};
