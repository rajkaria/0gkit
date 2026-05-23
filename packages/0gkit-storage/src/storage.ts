import {
  ConfigError,
  NetworkError,
  type DryRunResult,
  type Receipt,
  type Signer,
} from "@foundryprotocol/0gkit-core";
import { makeStorageEstimate, type StorageEstimate } from "./estimate.js";

const INDEXERS = {
  aristotle: "https://indexer-storage.0g.network",
  galileo: "https://indexer-storage-testnet.0g.ai",
} as const;
const DEFAULT_RPC = "https://evmrpc.0g.ai";

export interface StorageSdk {
  MemData: new (data: number[]) => {
    merkleTree(): Promise<readonly [{ rootHash(): string }, Error | null]>;
  };
  Indexer: new (url: string) => {
    upload(
      file: unknown,
      rpc: string,
      signer: unknown,
      opts?: unknown,
      retry?: unknown,
      tx?: unknown
    ): Promise<readonly [unknown, Error | null]>;
    downloadToBlob(
      root: string,
      opts?: unknown
    ): Promise<readonly [Blob | null, Error | null]>;
    peekHeader(root: string): Promise<readonly [unknown, Error | null]>;
  };
}

export interface StorageConfig {
  network?: "aristotle" | "galileo";
  indexerUrl?: string;
  rpcUrl?: string;
  /**
   * Preferred: pass a Signer from `@foundryprotocol/0gkit-wallet`.
   * Loaders that hold the plaintext key (`fromPrivateKey`, `fromFile`, `fromEnv`)
   * expose `signer.privateKey` — the SDK adapter uses that for now.
   * KMS-backed signers don't expose `privateKey`; they are accepted here but
   * writes will throw a clear ConfigError until SP10 swaps the adapter to
   * accept a Signer directly.
   */
  signer?: Signer;
  /**
   * @deprecated Pass `{ signer }` from `@foundryprotocol/0gkit-wallet` instead.
   * Will be removed in v0.3.
   */
  privateKey?: string;
  loadSdk?: () => Promise<StorageSdk>;
}

export interface UploadResult {
  root: string;
  tx: Receipt;
  raw: unknown;
}

function normalizeHex(s: string): string {
  return s.startsWith("0x") ? s : `0x${s}`;
}

/** @internal — exposed only for test isolation; not part of the public API. */
export let __resetDeprecationWarning: () => void;

let warnedPrivateKey = false;
__resetDeprecationWarning = () => {
  warnedPrivateKey = false;
};

export class Storage {
  readonly indexerUrl: string;
  readonly rpcUrl: string;
  private readonly privateKey?: string;
  private readonly loadSdk: () => Promise<StorageSdk>;
  private cached?: StorageSdk;

  /**
   * @param config - StorageConfig.
   *   When `signer` is provided, it is used in preference over `privateKey`.
   *   Loaders that hold the plaintext key (`fromPrivateKey`, `fromFile`,
   *   `fromEnv` for PRIVATE_KEY, wagmi LocalAccount) expose `signer.privateKey`
   *   — that's what the SDK adapter consumes for now.
   *
   *   KMS-backed signers don't expose `privateKey`; they're still accepted but
   *   writes will throw a clear ConfigError until SP10 swaps the SDK adapter
   *   to accept a Signer directly.
   */
  constructor(config: StorageConfig) {
    const net = config.network ?? "aristotle";
    this.indexerUrl = config.indexerUrl ?? INDEXERS[net];
    this.rpcUrl = config.rpcUrl ?? DEFAULT_RPC;

    if (config.signer) {
      // signer.privateKey may be undefined for KMS-backed signers — that is
      // intentional. The SDK adapter will throw a clear ConfigError if a write
      // path is hit without a key.
      this.privateKey = config.signer.privateKey;
    } else if (config.privateKey !== undefined) {
      if (!warnedPrivateKey) {
        console.warn(
          "@foundryprotocol/0gkit-storage: `{ privateKey }` is deprecated and will be removed in v2.\n" +
            "  Migrate to `{ signer: await fromEnv() }` (or fromPrivateKey/fromKMS) from @foundryprotocol/0gkit-wallet."
        );
        warnedPrivateKey = true;
      }
      this.privateKey = config.privateKey;
    }

    this.loadSdk =
      config.loadSdk ??
      (() =>
        import("@0gfoundation/0g-storage-ts-sdk" as string) as Promise<StorageSdk>);
  }

  private async sdk(): Promise<StorageSdk> {
    if (this.cached) return this.cached;
    try {
      this.cached = await this.loadSdk();
      return this.cached;
    } catch (err) {
      throw new ConfigError(
        `@0gfoundation/0g-storage-ts-sdk could not be loaded: ${
          err instanceof Error ? err.message : String(err)
        }`,
        `Install it: npm install @0gfoundation/0g-storage-ts-sdk ethers`
      );
    }
  }

  private async signer(): Promise<unknown> {
    if (!this.privateKey) {
      throw new ConfigError(
        `Storage.upload requires a private key. When using a KMS-backed Signer, writes are not yet supported (planned for SP10).`,
        `Pass { signer: await fromPrivateKey(key) } or { signer: await fromEnv() } to the Storage constructor.`
      );
    }
    try {
      const { Wallet, JsonRpcProvider } = (await import(
        "ethers" as string
      )) as typeof import("ethers");
      return new Wallet(this.privateKey, new JsonRpcProvider(this.rpcUrl));
    } catch (err) {
      throw new ConfigError(
        `ethers could not be loaded: ${
          err instanceof Error ? err.message : String(err)
        }`,
        `Install it: npm install ethers`
      );
    }
  }

  async estimate(data: Uint8Array): Promise<StorageEstimate> {
    return makeStorageEstimate(data.length);
  }

  async upload(data: Uint8Array): Promise<UploadResult>;
  async upload(
    data: Uint8Array,
    opts: { dryRun: true }
  ): Promise<DryRunResult<UploadResult>>;
  async upload(
    data: Uint8Array,
    opts?: { dryRun?: boolean }
  ): Promise<UploadResult | DryRunResult<UploadResult>> {
    if (opts?.dryRun) {
      const estimate = await this.estimate(data);
      const root = await this.computeRoot(data);
      const result: UploadResult = {
        root,
        tx: { latencyMs: 0 },
        raw: { dryRun: true },
      };
      return { dryRun: true, estimate, result };
    }
    const signer = await this.signer();
    const mod = await this.sdk();
    const startedAt = Date.now();
    const file = new mod.MemData(Array.from(data));
    const indexer = new mod.Indexer(this.indexerUrl);
    const [res, err] = await indexer.upload(file, this.rpcUrl, signer);
    if (err) {
      throw new NetworkError(
        `0G Storage upload failed: ${err.message}`,
        `Check the indexer (${this.indexerUrl}) and RPC are reachable and the signer is funded.`
      );
    }
    const o = res as Record<string, unknown>;
    const root =
      "rootHash" in o
        ? (o.rootHash as string)
        : (o.rootHashes as string[] | undefined)?.[0];
    const txHash =
      "txHash" in o ? (o.txHash as string) : (o.txHashes as string[] | undefined)?.[0];
    if (!root || !txHash) {
      throw new NetworkError(
        `0G Storage upload returned an unrecognized result shape.`,
        `Report this to the 0gkit maintainers with your @0gfoundation/0g-storage-ts-sdk version.`
      );
    }
    return {
      root: normalizeHex(root),
      tx: { txHash: normalizeHex(txHash), latencyMs: Date.now() - startedAt },
      raw: res,
    };
  }

  async download(root: string): Promise<Uint8Array> {
    const mod = await this.sdk();
    const indexer = new mod.Indexer(this.indexerUrl);
    const [blob, err] = await indexer.downloadToBlob(root, { proof: true });
    if (err) {
      throw new NetworkError(
        `0G Storage download failed: ${err.message}`,
        `Verify the root hash and that the indexer (${this.indexerUrl}) is reachable.`
      );
    }
    if (!blob) {
      throw new NetworkError(
        `0G Storage returned an empty blob for ${root}.`,
        `The root may not be finalized yet; retry shortly.`
      );
    }
    let buf: ArrayBuffer;
    try {
      buf = await blob.arrayBuffer();
    } catch (err) {
      throw new NetworkError(
        `Failed to read downloaded blob: ${
          err instanceof Error ? err.message : String(err)
        }`,
        `The indexer (${this.indexerUrl}) may have returned a truncated response.`
      );
    }
    return new Uint8Array(buf);
  }

  async computeRoot(data: Uint8Array): Promise<string> {
    const mod = await this.sdk();
    const file = new mod.MemData(Array.from(data));
    const [tree, err] = await file.merkleTree();
    if (err) {
      throw new NetworkError(
        `Merkle root computation failed: ${err.message}`,
        `This is a local computation; the input may be empty.`
      );
    }
    return normalizeHex(tree.rootHash());
  }

  /**
   * True if the root's header is retrievable. Transport errors (indexer down,
   * timeout) are treated as not-found and return false — callers polling for
   * finalization should retry rather than treat false as definitive.
   */
  async exists(root: string): Promise<boolean> {
    const mod = await this.sdk();
    const indexer = new mod.Indexer(this.indexerUrl);
    const [header, err] = await indexer.peekHeader(root);
    return !err && header != null;
  }

  async raw(): Promise<unknown> {
    return this.sdk();
  }
}
