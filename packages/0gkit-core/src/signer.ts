/**
 * The neutral signer abstraction shared by every 0gkit primitive.
 *
 * Implementations live in `@foundryprotocol/0gkit-wallet`
 * (`fromPrivateKey` / `fromFile` / `fromEnv` / `fromKMS`) and
 * `@foundryprotocol/0gkit-wallet-react` (wagmi-backed).
 *
 * Primitives import only this type — they never depend on the wallet package
 * at build time, keeping the dependency graph acyclic.
 */
export interface Signer {
  /** EIP-55 checksummed address (or lowercased 0x; both accepted by recipients). */
  readonly address: `0x${string}`;

  /**
   * EIP-191 personal-sign over arbitrary bytes (or a pre-hashed `{raw}`
   * structure that matches viem's `SignableMessage` type).
   */
  signMessage(
    bytes: string | Uint8Array | { raw: `0x${string}` | Uint8Array }
  ): Promise<`0x${string}`>;

  /** EIP-712 typed-data sign. */
  signTypedData(args: SignTypedDataArgs): Promise<`0x${string}`>;

  /** Broadcast a transaction. Returns the tx hash. */
  sendTransaction(tx: SignableTx): Promise<`0x${string}`>;

  /**
   * Optional: a raw private-key passthrough for legacy adapters (the existing
   * `0gkit-storage` / `0gkit-compute` paths that wrap ethers internally).
   * Loaders that hold the plaintext key (`fromPrivateKey`, `fromFile`,
   * `fromEnv` when reading PRIVATE_KEY) expose it; KMS-backed signers do not.
   */
  readonly privateKey?: `0x${string}`;

  /** Loader provenance tag — useful for logging/observability. */
  // eslint-disable-next-line @typescript-eslint/ban-types
  readonly source:
    | "private-key"
    | "file"
    | "env"
    | "kms"
    | "wagmi"
    | "custom"
    | (string & {});
}

export interface SignTypedDataArgs {
  domain: {
    name?: string;
    version?: string;
    chainId?: number | bigint;
    verifyingContract?: `0x${string}`;
    salt?: `0x${string}`;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}

export interface SignableTx {
  to?: `0x${string}`;
  value?: bigint;
  data?: `0x${string}`;
  gas?: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?: number;
  chainId?: number;
}
