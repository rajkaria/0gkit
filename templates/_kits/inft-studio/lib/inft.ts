/**
 * inft-studio — portable core
 *
 * Dependency-free: accepts injected { storage, erc721, attestor? } so the lib
 * works on every base and is fully unit-testable with mocks.
 *
 * Mint flow
 * ─────────
 * 1. Upload media bytes to 0G Storage → contentHash (media root)
 * 2. Build metadata JSON (with contentHash embedded), upload → metadataRoot
 * 3. Optionally attest provenance (model + prompt + contentHash signed by operator key)
 * 4. Mint via injected Erc721MintClient using INFT_ABI (standard ERC-721 has no mint —
 *    we ship Inft.sol which adds mint(address to, bytes32 metadataRoot) → tokenId)
 * 5. Return { tokenId, tokenUri, contentHash, provenance? }
 *
 * Attestation honesty seam
 * ────────────────────────
 * The Attestor interface is intentionally abstract. The adapter implements a
 * SIGNED RECEIPT: the operator key signs digestJson(provenanceReceipt) via
 * EIP-191 personal-sign (same mechanism as 0gkit-attestation uses internally).
 * Badge meaning: "✓ signature verified" — the digest matches and the expected
 * operator address signed it. NOT TEE-quote verification. A real TEE-quote
 * verifier can slot in later by implementing the same Attestor interface.
 *
 * ERC-721 Mint note
 * ─────────────────
 * Erc721Abi (from 0gkit-contracts) is the STANDARD ERC-721 ABI and has no mint.
 * The injected Erc721MintClient is wired by the adapter to Inft.sol's INFT_ABI
 * (lib/inft-abi.ts) via createTypedContract. Never call mint on Erc721Abi.
 */

// ---------------------------------------------------------------------------
// Injected interfaces (adapters and tests provide implementations)
// ---------------------------------------------------------------------------

/**
 * Minimal storage interface. Adapters wire @foundryprotocol/0gkit-storage here.
 * Content-addressed: upload returns an immutable root hash.
 */
export interface StorageClient {
  upload(bytes: Uint8Array): Promise<{ root: string }>;
}

/**
 * Typed ERC-721 mint client backed by the INFT_ABI (not the standard Erc721Abi).
 *
 * Adapters wire createTypedContract({ address, abi: INFT_ABI, signer }).write.mint here.
 *
 * IMPORTANT — tokenId source:
 *   createTypedContract().write.mint() returns a Receipt { txHash, blockNumber, latencyMs } —
 *   NOT the Solidity function's return value. The real tokenId MUST be obtained from the
 *   on-chain Minted event via contract.events.Minted({ fromBlock, toBlock, args: { to } }).
 *   Adapters must NOT fabricate or guess the tokenId from the Receipt.
 */
export interface Erc721MintClient {
  mint(to: string, metadataRoot: string): Promise<{ tokenId: bigint; txHash?: string }>;
}

/**
 * Signed-receipt attestor (same interface as ai-oracle).
 *
 * Default adapter impl: operator private key signs digestJson(provenanceReceipt)
 * via EIP-191 personal-sign. Badge: "✓ signature verified" — NOT TEE attestation.
 * Replace with a real TEE-quote verifier when one is available.
 */
export interface Attestor {
  sign(receipt: unknown): Promise<{ digest: string; signature: string }>;
  verify(
    receipt: unknown,
    signed: { digest: string; signature: string },
    expectedSigner: string
  ): Promise<{ ok: boolean; signer: string }>;
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/**
 * Raw input to mintInft.
 */
export interface MintInput {
  /** Recipient address for the minted NFT. */
  to: string;
  /** Metadata object (name, description, image, attributes, etc.). */
  metadata: Record<string, unknown>;
  /** Raw media bytes to upload to 0G Storage. */
  media: Uint8Array;
  /** If true, attest provenance (requires attestor in deps). */
  attestProvenance?: boolean;
  /** AI model used to generate the media (for provenance). */
  model?: string;
  /** Prompt used to generate the media (for provenance). */
  prompt?: string;
}

/**
 * Provenance receipt — the canonical object that is signed.
 * Returned verbatim so verifiers can reconstruct the exact object
 * that was passed to attestor.sign() without guessing `ts`.
 */
export interface ProvenanceReceipt {
  model: string;
  prompt: string;
  contentHash: string;
  ts: number;
}

/**
 * Provenance record attached to a minted iNFT.
 */
export interface Provenance {
  model: string;
  prompt: string;
  contentHash: string;
  /** The exact receipt object that was signed — pass to attestor.verify(). */
  receipt: ProvenanceReceipt;
  /** Operator-signed digest of the provenance receipt. */
  attestation?: { digest: string; signature: string };
}

/**
 * Result of a successful mint.
 */
export interface MintResult {
  /** Token ID returned by the INFT contract. */
  tokenId: bigint;
  /**
   * Token URI — "0g-storage://<metadataRoot>" pointing to the uploaded metadata.
   */
  tokenUri: string;
  /** Content hash (0G Storage root of the media bytes). */
  contentHash: string;
  /** Provenance record (present when attestProvenance=true). */
  provenance?: Provenance;
}

/**
 * Injected dependencies for mintInft.
 */
export interface MintDeps {
  storage: StorageClient;
  erc721: Erc721MintClient;
  attestor?: Attestor;
}

// ---------------------------------------------------------------------------
// mintInft
// ---------------------------------------------------------------------------

/**
 * Mint an intelligent NFT:
 *   upload media → upload metadata → (optional) attest provenance → mint
 *
 * @param input  Mint parameters (to, metadata, media, optional provenance fields).
 * @param deps   Injected storage, erc721 client, optional attestor.
 * @returns      MintResult with tokenId, tokenUri, contentHash, optional provenance.
 */
export async function mintInft(input: MintInput, deps: MintDeps): Promise<MintResult> {
  // 1. Upload media to 0G Storage → content-addressed root = contentHash
  const mediaUpload = await deps.storage.upload(input.media);
  const contentHash = mediaUpload.root;

  // 2. Build enriched metadata JSON (embed contentHash as media reference)
  const enrichedMeta = {
    ...input.metadata,
    mediaRoot: contentHash,
  };
  const metadataBytes = new TextEncoder().encode(JSON.stringify(enrichedMeta));
  const metaUpload = await deps.storage.upload(metadataBytes);
  const metadataRoot = metaUpload.root;

  // 3. Derive tokenUri from metadata root (mirrors StorageNFT.tokenURI format)
  const tokenUri = `0g-storage://${metadataRoot}`;

  // 4. Convert metadataRoot (hex string) to a bytes32-compatible string for the contract.
  //    The INFT contract expects bytes32; pad or hash the root to 32 bytes (64 hex chars).
  const metadataRootBytes32 = rootToBytes32(metadataRoot);

  // 5. Optional: attest provenance
  let provenance: Provenance | undefined;
  if (input.attestProvenance) {
    if (!deps.attestor) {
      throw new Error(
        "inft-studio: attestProvenance=true but no attestor was injected. " +
          "Wire an Attestor in the adapter (see adapters/react-app/app/api/inft/route.ts)."
      );
    }
    provenance = await buildProvenance(
      {
        model: input.model ?? "unknown",
        prompt: input.prompt ?? "",
        contentHash,
      },
      deps.attestor
    );
  }

  // 6. Mint via the injected typed erc721 client (wired to INFT_ABI by the adapter)
  const mintResult = await deps.erc721.mint(input.to, metadataRootBytes32);

  return {
    tokenId: mintResult.tokenId,
    tokenUri,
    contentHash,
    provenance,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Pad or truncate a 0G Storage root (hex string) to a bytes32 hex string.
 *
 * 0G Storage roots are typically 0x-prefixed 64-char hex strings (32 bytes).
 * If the root is already in that format, return it as-is. Otherwise hash it
 * to 32 bytes using a deterministic approach (left-pad with zeros / right-truncate).
 *
 * This stays in lib (no imports) by using a simple string pad — it does NOT use
 * keccak256 (which would require an import). The adapter may do a proper keccak
 * if it needs canonical on-chain semantics; for the lib/test layer this is sufficient.
 */
function rootToBytes32(root: string): string {
  // Strip 0x prefix
  const hex = root.startsWith("0x") ? root.slice(2) : root;
  // Left-pad to 64 hex chars (32 bytes) or right-truncate
  if (hex.length === 64) return "0x" + hex;
  if (hex.length < 64) return "0x" + hex.padStart(64, "0");
  return "0x" + hex.slice(0, 64);
}

/**
 * Build a provenance record: sign a canonical receipt via the injected attestor.
 */
async function buildProvenance(
  args: { model: string; prompt: string; contentHash: string },
  attestor: Attestor
): Promise<Provenance> {
  const receipt: ProvenanceReceipt = {
    model: args.model,
    prompt: args.prompt,
    contentHash: args.contentHash,
    ts: Date.now(),
  };

  const attestation = await attestor.sign(receipt);

  return {
    model: args.model,
    prompt: args.prompt,
    contentHash: args.contentHash,
    receipt,
    attestation,
  };
}
