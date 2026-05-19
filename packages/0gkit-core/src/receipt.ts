/**
 * Uniform result envelope returned by every 0gkit operation that touches
 * the chain. `explorerUrl` is only present when the active network preset
 * has a verified explorer base. `attestation` is opaque here; the
 * @foundryprotocol/0gkit-attestation package gives it a concrete type.
 */
export interface Receipt {
  /**
   * Transaction hash. Typed as `\`0x${string}\` | string`: the template-literal
   * half documents the expected hex shape, while `| string` is a deliberate
   * escape hatch so untyped sources (e.g. a JSON/HTTP faucet response) can be
   * assigned without a cast. Not vacuous — intentional ergonomics.
   */
  txHash?: `0x${string}` | string;
  explorerUrl?: string;
  blockNumber?: bigint;
  latencyMs: number;
  attestation?: unknown;
}
